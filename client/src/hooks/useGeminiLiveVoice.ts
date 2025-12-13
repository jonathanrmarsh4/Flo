/**
 * Gemini Live Voice Hook
 * Provides real-time bidirectional voice streaming using WebSocket
 * Uses separate audio contexts for capture (16kHz) and playback (24kHz)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getAuthToken } from '@/lib/queryClient';

interface GeminiLiveState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
}

interface UseGeminiLiveVoiceOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onFloResponse?: (text: string) => void;
  onTurnComplete?: () => void;
  onError?: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  endpoint?: 'gemini-live' | 'admin-sandbox' | 'sie-brainstorm';
}

// Simple moving average low-pass filter
function lowPassFilter(input: Float32Array, windowSize: number): Float32Array {
  if (windowSize <= 1) return input;
  
  const output = new Float32Array(input.length);
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < input.length; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(input.length, i + halfWindow + 1);
    
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    output[i] = sum / count;
  }
  
  return output;
}

// Downsample audio to target rate using low-pass filter + decimation
function downsample(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return input;
  }
  
  const ratio = inputSampleRate / outputSampleRate;
  // Calculate exact output length, ensuring we don't access past input bounds
  const outputLength = Math.floor(input.length / ratio);
  if (outputLength === 0) return new Float32Array(0);
  
  // Apply low-pass filter before decimation to prevent aliasing
  // Window size should be approximately the decimation ratio
  const filterWindow = Math.ceil(ratio);
  const filtered = lowPassFilter(input, filterWindow);
  
  // Simple decimation - pick every Nth sample
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = Math.floor(i * ratio);
    output[i] = filtered[srcIndex];
  }
  
  return output;
}

// Convert Uint8Array to base64 in chunks to avoid call stack limits
function uint8ToBase64(uint8: Uint8Array): string {
  const CHUNK_SIZE = 32768; // 32KB chunks to stay well under 65k limit
  let binary = '';
  
  for (let offset = 0; offset < uint8.length; offset += CHUNK_SIZE) {
    const chunk = uint8.subarray(offset, Math.min(offset + CHUNK_SIZE, uint8.length));
    for (let i = 0; i < chunk.length; i++) {
      binary += String.fromCharCode(chunk[i]);
    }
  }
  
  return btoa(binary);
}

export function useGeminiLiveVoice(options: UseGeminiLiveVoiceOptions = {}) {
  // Debug: log hook initialization with timestamp to verify code loading
  console.log('[GeminiLive] HOOK INITIALIZED - v3 ' + new Date().toISOString());
  
  const [state, setState] = useState<GeminiLiveState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  
  // Separate contexts for capture and playback
  const playbackContextRef = useRef<AudioContext | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Wake lock management - keeps screen awake during voice chat
  const acquireWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('[GeminiLive] Wake lock acquired - screen will stay awake');
        
        // Re-acquire if released (e.g., when tab becomes visible again)
        wakeLockRef.current.addEventListener('release', () => {
          console.log('[GeminiLive] Wake lock released');
        });
      } catch (err) {
        console.warn('[GeminiLive] Wake lock not available:', err);
      }
    } else {
      console.log('[GeminiLive] Wake Lock API not supported');
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      console.log('[GeminiLive] Wake lock released');
    }
  }, []);

  // Upsample audio from source rate to target rate (for iOS which ignores sampleRate param)
  const resampleAudio = useCallback((input: Float32Array, inputRate: number, outputRate: number): Float32Array => {
    if (inputRate === outputRate) return input;
    
    const ratio = outputRate / inputRate;
    const outputLength = Math.floor(input.length * ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i / ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      
      // Linear interpolation for smooth resampling
      output[i] = input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction;
    }
    
    return output;
  }, []);

  // Play queued audio buffers with precise timing to prevent gaps/crackle
  // Uses scheduled playback to ensure seamless audio stitching
  const playNextAudio = useCallback(() => {
    console.log('[GeminiLive] playNextAudio called, queue size:', audioQueueRef.current.length);
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      nextPlayTimeRef.current = 0; // Reset for next playback session
      setState(prev => ({ ...prev, isSpeaking: false }));
      console.log('[GeminiLive] Queue empty, stopping playback');
      return;
    }

    isPlayingRef.current = true;
    setState(prev => ({ ...prev, isSpeaking: true }));

    const buffer = audioQueueRef.current.shift()!;
    const ctx = playbackContextRef.current;
    if (!ctx) {
      console.error('[GeminiLive] No AudioContext for playback');
      return;
    }

    // Schedule playback with precise timing to prevent gaps
    // Use a small lookahead (10ms) to ensure smooth scheduling
    const currentTime = ctx.currentTime;
    const lookahead = 0.01; // 10ms lookahead for scheduling
    
    // Start time: either continue from last buffer or start fresh
    const startTime = Math.max(currentTime + lookahead, nextPlayTimeRef.current);
    
    // Schedule next buffer with a tiny overlap (2ms) to prevent pops between chunks
    const overlap = 0.002;
    nextPlayTimeRef.current = startTime + buffer.duration - overlap;

    console.log('[GeminiLive] Playing buffer, duration:', buffer.duration.toFixed(3), 
                'startTime:', startTime.toFixed(3), 'currentTime:', currentTime.toFixed(3));
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = playNextAudio;
    source.start(startTime); // Schedule at precise time instead of immediate start
  }, []);

  // Decode and queue incoming audio (24kHz PCM from Gemini)
  // Use OfflineAudioContext for high-quality resampling to avoid iOS Safari artifacts
  const handleAudioData = useCallback(async (base64Audio: string) => {
    try {
      // Initialize playback context if needed
      // Note: iOS Safari ignores sampleRate parameter and uses device's native rate
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext();
        console.log('[GeminiLive] AudioContext created with actual sampleRate:', playbackContextRef.current.sampleRate);
      }

      const ctx = playbackContextRef.current;
      
      // Resume context if suspended (autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Gemini outputs 24kHz 16-bit PCM (little-endian)
      const byteLength = bytes.length - (bytes.length % 2);
      const numSamples = byteLength / 2;
      
      const dataView = new DataView(bytes.buffer, bytes.byteOffset, byteLength);
      const floatSamples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const sample = dataView.getInt16(i * 2, true);
        floatSamples[i] = sample / 32768.0;
      }
      
      const GEMINI_SAMPLE_RATE = 24000;
      const targetSampleRate = ctx.sampleRate;
      
      // Use OfflineAudioContext for high-quality resampling
      // This does the resampling ONCE properly, avoiding per-chunk artifacts on iOS Safari
      if (targetSampleRate !== GEMINI_SAMPLE_RATE) {
        const ratio = targetSampleRate / GEMINI_SAMPLE_RATE;
        const outputLength = Math.ceil(numSamples * ratio);
        
        // Create offline context at target rate for proper resampling
        const offlineCtx = new OfflineAudioContext(1, outputLength, targetSampleRate);
        const sourceBuffer = offlineCtx.createBuffer(1, numSamples, GEMINI_SAMPLE_RATE);
        sourceBuffer.copyToChannel(floatSamples, 0);
        
        const source = offlineCtx.createBufferSource();
        source.buffer = sourceBuffer;
        source.connect(offlineCtx.destination);
        source.start();
        
        const renderedBuffer = await offlineCtx.startRendering();
        
        // Queue the properly resampled buffer
        audioQueueRef.current.push(renderedBuffer);
      } else {
        // No resampling needed
        const audioBuffer = ctx.createBuffer(1, floatSamples.length, GEMINI_SAMPLE_RATE);
        audioBuffer.copyToChannel(floatSamples, 0);
        audioQueueRef.current.push(audioBuffer);
      }

      if (!isPlayingRef.current) {
        playNextAudio();
      }
    } catch (error) {
      console.error('[GeminiLive] Failed to decode audio:', error);
    }
  }, [playNextAudio]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState(prev => ({ ...prev, error: null }));

    try {
      // Get auth token from secure storage (iOS) or localStorage (web)
      let authToken = await getAuthToken();
      
      // For web (session-based auth), fetch a short-lived WS token from server
      if (!authToken && !Capacitor.isNativePlatform()) {
        console.log('[GeminiLive] No JWT token, fetching WS token from server...');
        try {
          const response = await fetch('/api/auth/ws-token', { credentials: 'include' });
          if (response.ok) {
            const data = await response.json();
            authToken = data.token;
            console.log('[GeminiLive] Got WS token from server');
          } else {
            console.error('[GeminiLive] Failed to get WS token:', response.status);
          }
        } catch (e) {
          console.error('[GeminiLive] Error fetching WS token:', e);
        }
      }
      
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      // Determine WebSocket URL based on platform and endpoint
      const voiceEndpoint = options.endpoint || 'gemini-live';
      let wsUrl: string;
      if (Capacitor.isNativePlatform()) {
        // iOS/Android: Connect to production server
        wsUrl = `wss://get-flo.com/api/voice/${voiceEndpoint}?token=${encodeURIComponent(authToken)}`;
      } else {
        // Web: Use current host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/api/voice/${voiceEndpoint}?token=${encodeURIComponent(authToken)}`;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[GeminiLive] WebSocket connected');
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'connected':
              console.log('[GeminiLive] Session started:', message.sessionId);
              setState(prev => ({ ...prev, isConnected: true }));
              // Acquire wake lock to keep screen on during voice chat
              acquireWakeLock();
              options.onConnected?.();
              break;

            case 'audio':
              await handleAudioData(message.data);
              break;

            case 'transcript':
              options.onTranscript?.(message.text, message.isFinal);
              break;

            case 'response_text':
              // Model's text response
              console.log('[GeminiLive] Model response:', message.text?.substring(0, 50));
              options.onFloResponse?.(message.text);
              break;

            case 'turn_complete':
              // Model finished its turn - signal to flush accumulated text
              console.log('[GeminiLive] Turn complete');
              options.onTurnComplete?.();
              break;

            case 'error':
              console.error('[GeminiLive] Error:', message.message);
              setState(prev => ({ ...prev, error: message.message }));
              options.onError?.(message.message);
              break;
          }
        } catch (error) {
          console.error('[GeminiLive] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[GeminiLive] WebSocket error:', error);
        setState(prev => ({ ...prev, error: 'Connection error' }));
        options.onError?.('Connection error');
      };

      ws.onclose = (event) => {
        console.log('[GeminiLive] WebSocket closed:', event.code, event.reason);
        setState(prev => ({ ...prev, isConnected: false, isListening: false }));
        wsRef.current = null;
        options.onDisconnected?.();
      };

    } catch (error: any) {
      console.error('[GeminiLive] Connection failed:', error);
      setState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error.message);
    }
  }, [options, handleAudioData]);

  // Start streaming microphone audio as raw PCM (resampled to 16kHz)
  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[GeminiLive] Not connected');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Create capture context at device's native sample rate
      // We'll resample to 16kHz before sending
      const captureContext = new AudioContext();
      captureContextRef.current = captureContext;
      
      if (captureContext.state === 'suspended') {
        await captureContext.resume();
      }

      const deviceSampleRate = captureContext.sampleRate;
      console.log('[GeminiLive] Device sample rate:', deviceSampleRate);

      const source = captureContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Use ScriptProcessor to capture raw samples
      // Buffer size of 4096 gives good balance of latency and efficiency
      const processor = captureContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Downsample from device rate to 16kHz for Gemini
        const resampled = downsample(inputData, deviceSampleRate, 16000);
        if (resampled.length === 0) return;
        
        // Convert float32 (-1 to 1) to int16 PCM
        const int16Data = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
          const s = Math.max(-1, Math.min(1, resampled[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to base64 using chunked method to avoid stack limits
        const base64Audio = uint8ToBase64(new Uint8Array(int16Data.buffer));

        // Send PCM to server
        wsRef.current.send(JSON.stringify({
          type: 'audio',
          data: base64Audio,
        }));
      };

      // Connect source → processor → destination (must connect to destination for onaudioprocess to fire)
      // Create a silent destination to avoid feedback
      const gainNode = captureContext.createGain();
      gainNode.gain.value = 0; // Silent - no feedback
      
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(captureContext.destination);

      setState(prev => ({ ...prev, isListening: true }));
      console.log('[GeminiLive] Started listening - capturing and resampling to 16kHz');

    } catch (error: any) {
      console.error('[GeminiLive] Failed to start listening:', error);
      setState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error.message);
    }
  }, [options]);

  // Stop listening
  const stopListening = useCallback(() => {
    // Disconnect ScriptProcessor
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {
        // Ignore errors when disconnecting
      }
      processorRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (e) {
        // Ignore errors when disconnecting
      }
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close capture context (but keep playback context for incoming audio)
    if (captureContextRef.current) {
      captureContextRef.current.close().catch(() => {});
      captureContextRef.current = null;
    }

    setState(prev => ({ ...prev, isListening: false }));
    console.log('[GeminiLive] Stopped listening');
  }, []);

  // Disconnect - fully reset all state
  const disconnect = useCallback(() => {
    console.log('[GeminiLive] Disconnecting...');
    
    // Release wake lock immediately
    releaseWakeLock();
    
    stopListening();

    // Close WebSocket
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'end' }));
        }
        wsRef.current.close();
      } catch (e) {
        // Ignore errors when closing
      }
      wsRef.current = null;
    }

    // Reset all audio state
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;

    // Close playback context
    if (playbackContextRef.current) {
      playbackContextRef.current.close().catch(() => {});
      playbackContextRef.current = null;
    }

    // Reset state immediately
    setState({
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      error: null,
    });

    console.log('[GeminiLive] Disconnected and reset');
  }, [stopListening, releaseWakeLock]);

  // Send text message
  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[GeminiLive] Not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'text',
      text,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText,
  };
}

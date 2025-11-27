/**
 * Gemini Live Voice Hook
 * Provides real-time bidirectional voice streaming using WebSocket
 * Uses separate audio contexts for capture (16kHz) and playback (24kHz)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface GeminiLiveState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
}

interface UseGeminiLiveVoiceOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onFloResponse?: (text: string) => void;
  onError?: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
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
  const [state, setState] = useState<GeminiLiveState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  
  // Separate contexts for capture and playback
  const playbackContextRef = useRef<AudioContext | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Play queued audio buffers sequentially using playback context
  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setState(prev => ({ ...prev, isSpeaking: false }));
      return;
    }

    isPlayingRef.current = true;
    setState(prev => ({ ...prev, isSpeaking: true }));

    const buffer = audioQueueRef.current.shift()!;
    const ctx = playbackContextRef.current;
    if (!ctx) {
      console.error('[GeminiLive] No playback context available');
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = playNextAudio;
    source.start();
  }, []);

  // Decode and queue incoming audio (24kHz PCM from Gemini)
  const handleAudioData = useCallback(async (base64Audio: string) => {
    try {
      // Initialize playback context if needed (separate from capture)
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
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

      // Gemini outputs 24kHz 16-bit PCM
      const samples = new Int16Array(bytes.buffer);
      const floatSamples = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        floatSamples[i] = samples[i] / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, floatSamples.length, 24000);
      audioBuffer.copyToChannel(floatSamples, 0);

      audioQueueRef.current.push(audioBuffer);

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
      // Get auth token from localStorage (same as queryClient)
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/voice/gemini-live?token=${encodeURIComponent(authToken)}`;

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

  // Disconnect
  const disconnect = useCallback(() => {
    stopListening();

    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
      wsRef.current.close();
      wsRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Close playback context
    if (playbackContextRef.current) {
      playbackContextRef.current.close().catch(() => {});
      playbackContextRef.current = null;
    }

    setState({
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      error: null,
    });

    console.log('[GeminiLive] Disconnected');
  }, [stopListening]);

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

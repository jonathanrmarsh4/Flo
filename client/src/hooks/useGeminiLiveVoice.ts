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
  // Track if hook has been initialized (prevents excessive logging on re-renders)
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    initializedRef.current = true;
    console.log('[GeminiLive] HOOK INITIALIZED - v5 ' + new Date().toISOString());
  }
  
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
  
  // Use Float32Array queue for batching small audio chunks
  const pendingAudioRef = useRef<Float32Array[]>([]);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Scheduled playback timing for gapless audio
  const nextPlayTimeRef = useRef<number>(0);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Playback stall detection - monitors ctx.currentTime advancement
  const lastCtxTimeRef = useRef<number>(0);
  const lastCtxCheckRef = useRef<number>(Date.now());
  const stallCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const STALL_THRESHOLD_MS = 2000; // Consider stalled if ctx.currentTime doesn't advance for 2s while audio queued
  
  // Minimum batch size in samples (target ~200ms of audio at 24kHz = 4800 samples)
  const MIN_BATCH_SAMPLES = 4800;
  
  // ===== FREEZE DETECTION & AUTO-RECONNECT =====
  const lastAudioReceivedRef = useRef<number>(Date.now());
  const lastAudioSentRef = useRef<number>(Date.now()); // Track when we last sent audio to prevent false freezes
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const freezeCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const isReconnectingRef = useRef<boolean>(false);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const FREEZE_TIMEOUT_MS = 15000; // Consider frozen if no audio in EITHER direction for 15 seconds
  const HEARTBEAT_INTERVAL_MS = 15000; // Send heartbeat every 15 seconds

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

  // Track current playback for timeout fallback
  const playbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Flush pending audio samples into a single buffer for playback
  const flushPendingAudio = useCallback(() => {
    if (pendingAudioRef.current.length === 0) return null;
    
    const ctx = playbackContextRef.current;
    if (!ctx) return null;
    
    // Calculate total samples
    let totalSamples = 0;
    for (const chunk of pendingAudioRef.current) {
      totalSamples += chunk.length;
    }
    
    if (totalSamples === 0) return null;
    
    // Merge all chunks into one Float32Array
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of pendingAudioRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Clear pending queue
    pendingAudioRef.current = [];
    
    // Create AudioBuffer (Gemini outputs 24kHz)
    const GEMINI_SAMPLE_RATE = 24000;
    const audioBuffer = ctx.createBuffer(1, merged.length, GEMINI_SAMPLE_RATE);
    audioBuffer.copyToChannel(merged, 0);
    
    return audioBuffer;
  }, []);

  // Play queued audio buffers using scheduled playback for gapless audio
  const playNextAudio = useCallback(async () => {
    const ctx = playbackContextRef.current;
    if (!ctx) {
      console.error('[GeminiLive] No AudioContext for playback');
      return;
    }
    
    // Resume context if suspended (Safari often suspends during playback)
    if (ctx.state === 'suspended') {
      console.log('[GeminiLive] Resuming suspended AudioContext before playback');
      try {
        await ctx.resume();
      } catch (e) {
        console.error('[GeminiLive] Failed to resume AudioContext:', e);
        return;
      }
    }
    
    // Check if we have enough pending audio to flush
    let pendingSamples = 0;
    for (const chunk of pendingAudioRef.current) {
      pendingSamples += chunk.length;
    }
    
    // Flush pending audio if we have enough samples
    if (pendingSamples >= MIN_BATCH_SAMPLES) {
      const buffer = flushPendingAudio();
      if (buffer) {
        audioQueueRef.current.push(buffer);
      }
    }
    
    if (audioQueueRef.current.length === 0) {
      // No complete buffers ready - check again shortly if we have pending samples
      if (pendingSamples > 0) {
        if (batchTimeoutRef.current) clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = setTimeout(() => {
          const buffer = flushPendingAudio();
          if (buffer) {
            audioQueueRef.current.push(buffer);
            playNextAudio();
          }
        }, 100); // Flush remaining after 100ms
      } else {
        isPlayingRef.current = false;
        setState(prev => ({ ...prev, isSpeaking: false }));
      }
      return;
    }

    isPlayingRef.current = true;
    setState(prev => ({ ...prev, isSpeaking: true }));

    // Schedule multiple buffers at once for truly gapless playback
    const currentTime = ctx.currentTime;
    let scheduleTime = Math.max(currentTime, nextPlayTimeRef.current);
    
    // Schedule up to 3 buffers ahead for smooth playback
    const maxSchedule = Math.min(3, audioQueueRef.current.length);
    let lastSource: AudioBufferSourceNode | null = null;
    
    for (let i = 0; i < maxSchedule; i++) {
      const buffer = audioQueueRef.current.shift()!;
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(scheduleTime);
      
      scheduleTime += buffer.duration;
      lastSource = source;
      
      // Only log the first buffer to reduce noise
      if (i === 0) {
        console.log('[GeminiLive] Scheduled', maxSchedule, 'buffers, first duration:', buffer.duration.toFixed(3), 'queue remaining:', audioQueueRef.current.length);
      }
    }
    
    nextPlayTimeRef.current = scheduleTime;
    
    // PRIMARY: Use onended callback on the last buffer to trigger next batch
    // This is more reliable than setTimeout which can be throttled on mobile
    if (lastSource) {
      lastSource.onended = () => {
        // Check if there's more audio to play or pending to flush
        const hasPending = pendingAudioRef.current.length > 0;
        const hasQueued = audioQueueRef.current.length > 0;
        
        if (hasPending || hasQueued) {
          // Immediately trigger next batch - don't rely on timer
          playNextAudio();
        } else {
          // No more audio - mark as done
          isPlayingRef.current = false;
          setState(prev => ({ ...prev, isSpeaking: false }));
        }
      };
    }
    
    // BACKUP: Also schedule via setTimeout as a safety net (in case onended doesn't fire)
    const timeUntilDone = (scheduleTime - currentTime) * 1000;
    if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
    playbackTimeoutRef.current = setTimeout(() => {
      playNextAudio();
    }, Math.max(50, timeUntilDone - 200)); // Check 200ms before end
  }, [flushPendingAudio]);

  // Decode and queue incoming audio (24kHz PCM from Gemini)
  // Batches small chunks together for smooth playback
  const handleAudioData = useCallback(async (base64Audio: string) => {
    // Track last audio received for freeze detection
    lastAudioReceivedRef.current = Date.now();
    
    try {
      // Initialize playback context if needed (24kHz to match Gemini output)
      if (!playbackContextRef.current) {
        // Request 24kHz but iOS may give us device rate - we'll handle resampling in batches
        playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
        console.log('[GeminiLive] AudioContext created with actual sampleRate:', playbackContextRef.current.sampleRate);
        nextPlayTimeRef.current = 0; // Reset scheduled time
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
      
      // Add to pending queue (batching small chunks)
      pendingAudioRef.current.push(floatSamples);
      
      // Check if we have enough samples to flush (target ~200ms batches)
      let pendingSamples = 0;
      for (const chunk of pendingAudioRef.current) {
        pendingSamples += chunk.length;
      }
      
      // Start playback if not already running
      if (!isPlayingRef.current && pendingSamples >= MIN_BATCH_SAMPLES) {
        playNextAudio();
      } else if (!isPlayingRef.current && pendingSamples > 0) {
        // Schedule a delayed flush for smoother startup
        if (batchTimeoutRef.current) clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = setTimeout(() => {
          if (!isPlayingRef.current) {
            playNextAudio();
          }
        }, 150);
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
              
              // Reset reconnect counter on successful connect
              reconnectAttemptRef.current = 0;
              isReconnectingRef.current = false;
              lastAudioReceivedRef.current = Date.now();
              
              // Start heartbeat - send ping every 15 seconds to keep connection alive
              if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
              heartbeatIntervalRef.current = setInterval(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  try {
                    wsRef.current.send(JSON.stringify({ type: 'ping' }));
                    console.log('[GeminiLive] Heartbeat ping sent');
                  } catch (e) {
                    console.error('[GeminiLive] Failed to send heartbeat');
                  }
                }
              }, HEARTBEAT_INTERVAL_MS);
              
              // Start freeze detection - check if audio stopped flowing in BOTH directions
              // Only trigger freeze if NEITHER user is sending NOR Gemini is responding
              if (freezeCheckIntervalRef.current) clearInterval(freezeCheckIntervalRef.current);
              freezeCheckIntervalRef.current = setInterval(() => {
                const now = Date.now();
                const timeSinceLastReceived = now - lastAudioReceivedRef.current;
                const timeSinceLastSent = now - lastAudioSentRef.current;
                
                // Only consider frozen if BOTH directions have been idle for the timeout
                // This prevents false freezes when user is speaking (sending audio)
                const bothDirectionsIdle = timeSinceLastReceived > FREEZE_TIMEOUT_MS && 
                                           timeSinceLastSent > FREEZE_TIMEOUT_MS;
                
                if (wsRef.current?.readyState === WebSocket.OPEN && bothDirectionsIdle) {
                  console.warn('[GeminiLive] FREEZE DETECTED - No audio in either direction for', 
                    (Math.min(timeSinceLastReceived, timeSinceLastSent) / 1000).toFixed(1), 'seconds');
                  
                  // Trigger auto-reconnect
                  if (!isReconnectingRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
                    isReconnectingRef.current = true;
                    reconnectAttemptRef.current++;
                    console.log('[GeminiLive] Attempting auto-reconnect, attempt', reconnectAttemptRef.current, 'of', MAX_RECONNECT_ATTEMPTS);
                    
                    // Close current connection and reconnect
                    try {
                      wsRef.current?.close();
                    } catch (e) {}
                    
                    // Reconnect after brief delay
                    setTimeout(() => {
                      if (isReconnectingRef.current) {
                        options.onError?.('Connection froze - reconnecting...');
                      }
                    }, 500);
                  }
                }
              }, 3000); // Check every 3 seconds
              
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
        
        // Clear heartbeat and freeze check intervals
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        if (freezeCheckIntervalRef.current) {
          clearInterval(freezeCheckIntervalRef.current);
          freezeCheckIntervalRef.current = null;
        }
        
        setState(prev => ({ ...prev, isConnected: false, isListening: false }));
        wsRef.current = null;
        
        // Check if this was a freeze-triggered close - auto-reconnect
        if (isReconnectingRef.current && reconnectAttemptRef.current <= MAX_RECONNECT_ATTEMPTS) {
          console.log('[GeminiLive] Auto-reconnecting after freeze...');
          // Delay reconnect slightly to allow cleanup
          setTimeout(async () => {
            try {
              // Re-establish connection
              const reconnectAttempt = reconnectAttemptRef.current;
              console.log('[GeminiLive] Reconnect attempt', reconnectAttempt);
              
              // Get fresh auth token
              let authToken = await getAuthToken();
              if (!authToken && !Capacitor.isNativePlatform()) {
                const response = await fetch('/api/auth/ws-token', { credentials: 'include' });
                if (response.ok) {
                  const data = await response.json();
                  authToken = data.token;
                }
              }
              
              if (authToken) {
                const voiceEndpoint = options.endpoint || 'gemini-live';
                let wsUrl: string;
                if (Capacitor.isNativePlatform()) {
                  wsUrl = `wss://get-flo.com/api/voice/${voiceEndpoint}?token=${encodeURIComponent(authToken)}`;
                } else {
                  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                  wsUrl = `${protocol}//${window.location.host}/api/voice/${voiceEndpoint}?token=${encodeURIComponent(authToken)}`;
                }
                
                console.log('[GeminiLive] Creating new WebSocket for reconnect');
                const newWs = new WebSocket(wsUrl);
                wsRef.current = newWs;
                
                // Reattach all handlers (they're defined in the outer scope)
                newWs.onopen = ws.onopen;
                newWs.onmessage = ws.onmessage;
                newWs.onerror = ws.onerror;
                newWs.onclose = ws.onclose;
              } else {
                console.error('[GeminiLive] Failed to get auth token for reconnect');
                isReconnectingRef.current = false;
                options.onDisconnected?.();
              }
            } catch (e) {
              console.error('[GeminiLive] Reconnect failed:', e);
              isReconnectingRef.current = false;
              options.onDisconnected?.();
            }
          }, 1000);
        } else {
          // Normal disconnect or max retries reached
          isReconnectingRef.current = false;
          options.onDisconnected?.();
        }
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

        // Track when we last sent audio (for freeze detection)
        lastAudioSentRef.current = Date.now();

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
    
    // IMPORTANT: Disable auto-reconnect for user-initiated disconnect
    isReconnectingRef.current = false;
    reconnectAttemptRef.current = MAX_RECONNECT_ATTEMPTS + 1; // Prevent reconnect
    
    // Release wake lock immediately
    releaseWakeLock();
    
    // Clear all timeouts and intervals
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (freezeCheckIntervalRef.current) {
      clearInterval(freezeCheckIntervalRef.current);
      freezeCheckIntervalRef.current = null;
    }
    
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
    pendingAudioRef.current = [];
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

  // Handle visibility changes - resume AudioContext when tab becomes visible (Safari fix)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && playbackContextRef.current) {
        if (playbackContextRef.current.state === 'suspended') {
          console.log('[GeminiLive] Tab visible - resuming suspended AudioContext');
          try {
            await playbackContextRef.current.resume();
            // If we have queued audio and not playing, restart playback
            if (audioQueueRef.current.length > 0 && !isPlayingRef.current) {
              console.log('[GeminiLive] Restarting playback after visibility change');
              playNextAudio();
            }
          } catch (e) {
            console.error('[GeminiLive] Failed to resume on visibility change:', e);
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [playNextAudio]);

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

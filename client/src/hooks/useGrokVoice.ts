/**
 * Grok Voice Hook
 * Real-time bidirectional voice streaming using xAI's Grok Voice Agent API
 * Uses WebSocket to communicate with the backend
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getAuthToken } from '@/lib/queryClient';

interface GrokVoiceState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
}

type GrokVoiceName = 'Ara' | 'Eve' | 'Leo' | 'Sal' | 'Rex' | 'Mika' | 'Valentin';

interface UseGrokVoiceOptions {
  voiceName?: GrokVoiceName;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onGrokResponse?: (text: string) => void;
  onTurnComplete?: () => void;
  onError?: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

function uint8ToBase64(uint8: Uint8Array): string {
  const CHUNK_SIZE = 32768;
  let binary = '';
  
  for (let offset = 0; offset < uint8.length; offset += CHUNK_SIZE) {
    const chunk = uint8.subarray(offset, Math.min(offset + CHUNK_SIZE, uint8.length));
    for (let i = 0; i < chunk.length; i++) {
      binary += String.fromCharCode(chunk[i]);
    }
  }
  
  return btoa(binary);
}

function downsample(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return input;
  }
  
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  if (outputLength === 0) return new Float32Array(0);
  
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = Math.floor(i * ratio);
    output[i] = input[srcIndex];
  }
  
  return output;
}

export function useGrokVoice(options: UseGrokVoiceOptions = {}) {
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    initializedRef.current = true;
    console.log('[GrokVoice] Hook initialized - ' + new Date().toISOString());
  }
  
  const [state, setState] = useState<GrokVoiceState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setState(prev => ({ ...prev, isSpeaking: false }));
      return;
    }

    const ctx = playbackContextRef.current;
    if (!ctx || ctx.state === 'closed') return;

    isPlayingRef.current = true;
    setState(prev => ({ ...prev, isSpeaking: true }));

    const buffer = audioQueueRef.current.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    nextPlayTimeRef.current = startTime + buffer.duration;

    source.start(startTime);
    source.onended = () => {
      if (audioQueueRef.current.length > 0) {
        playNextInQueue();
      } else {
        isPlayingRef.current = false;
        setState(prev => ({ ...prev, isSpeaking: false }));
      }
    };
  }, []);

  const queueAudioChunk = useCallback((base64Audio: string) => {
    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }

      const ctx = playbackContextRef.current;
      if (!ctx) return;

      const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.copyToChannel(float32Array, 0);
      audioQueueRef.current.push(audioBuffer);

      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    } catch (err) {
      console.error('[GrokVoice] Error queuing audio:', err);
    }
  }, [playNextInQueue]);

  const connect = useCallback(async () => {
    console.log('[GrokVoice] Connecting...');
    setState(prev => ({ ...prev, error: null }));

    try {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
      await playbackContextRef.current.resume();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      let wsUrl = `${protocol}//${host}/api/voice/grok-sandbox`;

      const token = await getAuthToken();
      const params = new URLSearchParams();
      if (token) {
        params.set('token', token);
      }
      if (options.voiceName) {
        params.set('voice', options.voiceName);
      }
      const paramString = params.toString();
      if (paramString) {
        wsUrl += `?${paramString}`;
      }

      console.log('[GrokVoice] Connecting to:', wsUrl.split('?')[0]);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[GrokVoice] WebSocket connected');
        setState(prev => ({ ...prev, isConnected: true, error: null }));
        options.onConnected?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'audio':
              if (message.data) {
                queueAudioChunk(message.data);
              }
              break;
            case 'transcript':
              options.onTranscript?.(message.text, message.isFinal);
              break;
            case 'text':
            case 'response_text':
              options.onGrokResponse?.(message.text);
              break;
            case 'turnComplete':
            case 'turn_complete':
              options.onTurnComplete?.();
              break;
            case 'error':
              console.error('[GrokVoice] Server error:', message.message);
              setState(prev => ({ ...prev, error: message.message }));
              options.onError?.(message.message);
              break;
          }
        } catch (err) {
          console.error('[GrokVoice] Error parsing message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[GrokVoice] WebSocket error:', error);
        setState(prev => ({ ...prev, error: 'Connection error' }));
        options.onError?.('Connection error');
      };

      ws.onclose = () => {
        console.log('[GrokVoice] WebSocket closed');
        setState(prev => ({ ...prev, isConnected: false, isListening: false }));
        options.onDisconnected?.();
      };

    } catch (err: any) {
      console.error('[GrokVoice] Connection failed:', err);
      setState(prev => ({ ...prev, error: err.message }));
      options.onError?.(err.message);
    }
  }, [options, queueAudioChunk]);

  const disconnect = useCallback(() => {
    console.log('[GrokVoice] Disconnecting...');

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (captureContextRef.current && captureContextRef.current.state !== 'closed') {
      captureContextRef.current.close();
      captureContextRef.current = null;
    }
    if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;

    setState({
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      error: null,
    });
  }, []);

  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[GrokVoice] Cannot start listening - not connected');
      return;
    }

    console.log('[GrokVoice] Starting microphone...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;
      console.log('[GrokVoice] Got media stream, tracks:', stream.getAudioTracks().length);

      const ctx = new AudioContext({ sampleRate: 16000 });
      captureContextRef.current = ctx;
      
      console.log('[GrokVoice] AudioContext created, state:', ctx.state, 'sampleRate:', ctx.sampleRate);
      
      // Resume AudioContext if suspended (required by most browsers)
      if (ctx.state === 'suspended') {
        console.log('[GrokVoice] Resuming suspended AudioContext...');
        await ctx.resume();
        console.log('[GrokVoice] AudioContext resumed, state:', ctx.state);
      }

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Use ScriptProcessor with smaller buffer for lower latency
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      
      console.log('[GrokVoice] ScriptProcessor created, bufferSize:', processor.bufferSize);

      let audioChunkCount = 0;
      processor.onaudioprocess = (e) => {
        audioChunkCount++;
        
        // Log every 50th chunk to avoid spam
        if (audioChunkCount === 1 || audioChunkCount % 50 === 0) {
          console.log('[GrokVoice] Audio chunk', audioChunkCount, 'wsState:', wsRef.current?.readyState);
        }
        
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (audioChunkCount <= 5) {
            console.warn('[GrokVoice] WebSocket not ready, dropping audio chunk');
          }
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Check if we have actual audio data (not silence)
        if (audioChunkCount <= 3) {
          const maxVal = Math.max(...Array.from(inputData).map(Math.abs));
          console.log('[GrokVoice] Audio sample check, maxValue:', maxVal.toFixed(4));
        }
        
        const downsampled = downsample(inputData, ctx.sampleRate, 16000);

        const int16Array = new Int16Array(downsampled.length);
        for (let i = 0; i < downsampled.length; i++) {
          const s = Math.max(-1, Math.min(1, downsampled[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const base64 = uint8ToBase64(new Uint8Array(int16Array.buffer));
        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      
      console.log('[GrokVoice] Audio pipeline connected');

      setState(prev => ({ ...prev, isListening: true }));
      console.log('[GrokVoice] Microphone started');

    } catch (err: any) {
      console.error('[GrokVoice] Microphone error:', err);
      setState(prev => ({ ...prev, error: 'Microphone access denied' }));
      options.onError?.('Microphone access denied');
    }
  }, [options]);

  const stopListening = useCallback(() => {
    console.log('[GrokVoice] Stopping microphone...');

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (captureContextRef.current && captureContextRef.current.state !== 'closed') {
      captureContextRef.current.close();
      captureContextRef.current = null;
    }

    setState(prev => ({ ...prev, isListening: false }));
  }, []);

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
  };
}

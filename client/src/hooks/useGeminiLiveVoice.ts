/**
 * Gemini Live Voice Hook
 * Provides real-time bidirectional voice streaming using WebSocket
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
  onError?: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useGeminiLiveVoice(options: UseGeminiLiveVoiceOptions = {}) {
  const [state, setState] = useState<GeminiLiveState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Play queued audio buffers sequentially
  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setState(prev => ({ ...prev, isSpeaking: false }));
      return;
    }

    isPlayingRef.current = true;
    setState(prev => ({ ...prev, isSpeaking: true }));

    const buffer = audioQueueRef.current.shift()!;
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = playNextAudio;
    source.start();
  }, []);

  // Decode and queue incoming audio
  const handleAudioData = useCallback(async (base64Audio: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const ctx = audioContextRef.current;
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

  // Start streaming microphone audio using MediaRecorder for better compatibility
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

      // Create audio context for resampling if needed
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create a destination for processing (NOT connected to speakers to avoid feedback)
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);

      // Use MediaRecorder for capturing - more reliable across browsers
      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      // Store reference for cleanup
      (processorRef as any).current = mediaRecorder;

      // Collect audio chunks and send periodically
      const audioChunks: Blob[] = [];
      let sendInterval: NodeJS.Timeout;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      // Send audio data every 250ms for low latency
      sendInterval = setInterval(async () => {
        if (audioChunks.length === 0) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks.length = 0; // Clear the array

        try {
          // Convert blob to base64
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64Audio = btoa(binary);

          // Send to server (server will need to decode webm and convert to PCM)
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: base64Audio,
            format: 'webm',
          }));
        } catch (error) {
          console.error('[GeminiLive] Failed to send audio chunk:', error);
        }
      }, 250);

      // Store interval for cleanup
      (processorRef as any).sendInterval = sendInterval;

      // Start recording with timeslice for continuous data
      mediaRecorder.start(100);

      setState(prev => ({ ...prev, isListening: true }));
      console.log('[GeminiLive] Started listening with MediaRecorder');

    } catch (error: any) {
      console.error('[GeminiLive] Failed to start listening:', error);
      setState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error.message);
    }
  }, [options]);

  // Stop listening
  const stopListening = useCallback(() => {
    // Stop send interval
    if ((processorRef as any).sendInterval) {
      clearInterval((processorRef as any).sendInterval);
      (processorRef as any).sendInterval = null;
    }
    
    // Stop MediaRecorder
    if ((processorRef as any).current && (processorRef as any).current.state !== 'inactive') {
      try {
        (processorRef as any).current.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
      (processorRef as any).current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
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
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
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

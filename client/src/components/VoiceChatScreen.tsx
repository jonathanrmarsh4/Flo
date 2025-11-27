import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, MicOff, Volume2, Sparkles, Activity, Heart, Moon, TrendingUp, Loader2, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FloLogo } from './FloLogo';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import xaiLogo from '@assets/xai-logo.svg';
import { 
  isNativeMicrophoneAvailable, 
  startNativeCapture, 
  stopNativeCapture, 
  addAudioDataListener,
  type AudioDataEvent 
} from '@/lib/nativeMicrophone';

interface Message {
  id: string;
  type: 'user' | 'flo';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
}

interface VoiceChatScreenProps {
  isDark: boolean;
  onClose: () => void;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
type VoiceState = 'idle' | 'listening' | 'speaking';

const quickSuggestions = [
  { icon: Activity, text: "What's my glucose trend?", color: "from-blue-500 to-cyan-500" },
  { icon: Heart, text: "Review my heart health", color: "from-red-500 to-pink-500" },
  { icon: Moon, text: "Analyze my sleep quality", color: "from-purple-500 to-indigo-500" },
  { icon: TrendingUp, text: "Show recent improvements", color: "from-green-500 to-emerald-500" },
];

// Helper to convert Float32Array to base64-encoded 16-bit PCM
function float32ToBase64Pcm16(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to decode base64 PCM to Float32Array
function base64PcmToFloat32(base64: string, sampleRate: number = 16000): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768;
  }
  return float32Array;
}

// Simple resampler for audio
function resample(inputArray: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return inputArray;
  }
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(inputArray.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputArray.length - 1);
    const t = srcIndex - srcIndexFloor;
    output[i] = inputArray[srcIndexFloor] * (1 - t) + inputArray[srcIndexCeil] * t;
  }
  return output;
}

export function VoiceChatScreen({ isDark, onClose }: VoiceChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'flo',
      content: "Hi there! I'm Flō Oracle, your personal health AI. Tap the mic to start our conversation.",
      timestamp: new Date(),
      isVoice: false,
    },
  ]);
  
  // Voice state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  
  // Text fallback state
  const [inputValue, setInputValue] = useState('');
  const [isTextLoading, setIsTextLoading] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceStateRef = useRef<VoiceState>('idle');
  const nativeListenerRef = useRef<{ remove: () => void } | null>(null);
  const isUsingNativeMicRef = useRef(false);
  
  const { toast } = useToast();

  // Keep voiceStateRef in sync
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Recording duration timer
  useEffect(() => {
    if (voiceState === 'listening') {
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setRecordingDuration(0);
    }
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [voiceState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectVoice();
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize playback audio context (separate from capture)
  const initPlaybackContext = async () => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext();
    }
    if (playbackContextRef.current.state === 'suspended') {
      await playbackContextRef.current.resume();
    }
    return playbackContextRef.current;
  };

  // Connect to ElevenLabs via signed URL
  const connectVoice = async () => {
    try {
      setConnectionState('connecting');
      
      // Get signed URL from backend
      const response = await apiRequest('POST', '/api/elevenlabs/get-signed-url');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get voice connection');
      }
      
      const { signed_url } = await response.json() as { signed_url: string };
      
      // Initialize playback context
      await initPlaybackContext();
      
      // Check if we should use native microphone capture (iOS only)
      const useNativeMic = isNativeMicrophoneAvailable();
      isUsingNativeMicRef.current = useNativeMic;
      console.log('[VoiceChat] Using native microphone:', useNativeMic);
      
      let nativeSampleRate = 16000; // Native plugin outputs 16kHz
      
      if (!useNativeMic) {
        // Web fallback: Request microphone access via getUserMedia
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } 
        });
        mediaStreamRef.current = stream;
        
        // Create capture audio context (use device's native sample rate)
        audioContextRef.current = new AudioContext();
        nativeSampleRate = audioContextRef.current.sampleRate;
        console.log('[VoiceChat] Web audio sample rate:', nativeSampleRate);
      }
      
      // Connect WebSocket
      const ws = new WebSocket(signed_url);
      wsRef.current = ws;
      
      ws.onopen = async () => {
        console.log('[VoiceChat] WebSocket connected');
        setConnectionState('connected');
        setVoiceState('listening');
        
        if (useNativeMic) {
          // iOS: Start native microphone capture
          await startNativeMicrophoneCapture(ws);
        } else {
          // Web: Start audio capture via ScriptProcessor
          startAudioCapture(mediaStreamRef.current!, nativeSampleRate, ws);
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('[VoiceChat] Error parsing message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('[VoiceChat] WebSocket error:', error);
        setConnectionState('error');
        toast({
          title: "Voice connection error",
          description: "There was a problem with the voice connection. Try again or use text mode.",
          variant: "destructive",
        });
      };
      
      ws.onclose = () => {
        console.log('[VoiceChat] WebSocket closed');
        setConnectionState('disconnected');
        setVoiceState('idle');
        stopAudioCapture();
      };
      
    } catch (error: any) {
      console.error('[VoiceChat] Connection error:', error);
      setConnectionState('error');
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Microphone access denied",
          description: "Please allow microphone access to use voice chat, or switch to text mode.",
          variant: "destructive",
        });
        setIsVoiceMode(false);
      } else {
        toast({
          title: "Voice unavailable",
          description: error.message || "Could not connect to voice service. Using text mode.",
          variant: "destructive",
        });
        setIsVoiceMode(false);
      }
    }
  };
  
  // iOS native microphone capture - bypasses WKWebView getUserMedia limitations
  const startNativeMicrophoneCapture = async (ws: WebSocket) => {
    try {
      console.log('[VoiceChat] Starting native microphone capture for iOS...');
      
      // Start native capture
      const result = await startNativeCapture();
      console.log('[VoiceChat] Native capture started:', result);
      
      // Verify we got a valid result
      if (!result.success || typeof result.sampleRate !== 'number') {
        throw new Error('Native capture failed to start properly');
      }
      
      let chunksSent = 0;
      let lastLogTime = Date.now();
      
      // Listen for audio data from native plugin
      const listener = await addAudioDataListener((event: AudioDataEvent) => {
        const now = Date.now();
        
        // Skip empty audio chunks (conversion issues)
        if (!event.audio || event.sampleCount === 0) {
          return;
        }
        
        // Only send audio when listening (not when Flo is speaking)
        if (ws.readyState === WebSocket.OPEN && voiceStateRef.current === 'listening') {
          // Update audio level visualization
          setAudioLevel(Math.min(100, event.rms * 500));
          
          // Send audio directly to ElevenLabs (already 16kHz PCM from native)
          ws.send(JSON.stringify({
            user_audio_chunk: event.audio
          }));
          
          chunksSent++;
          
          // Log every 2 seconds
          if (now - lastLogTime > 2000) {
            console.log('[VoiceChat] Native audio chunks sent:', chunksSent, 'rms:', event.rms.toFixed(4));
            lastLogTime = now;
          }
        } else if (now - lastLogTime > 2000) {
          console.log('[VoiceChat] Not sending native audio - wsReady:', ws.readyState === WebSocket.OPEN, 'state:', voiceStateRef.current);
          lastLogTime = now;
        }
      });
      
      nativeListenerRef.current = listener;
      console.log('[VoiceChat] Native microphone listener registered');
      
    } catch (error) {
      console.error('[VoiceChat] Error starting native microphone:', error);
      // Reset native mode flag on failure
      isUsingNativeMicRef.current = false;
      throw error;
    }
  };

  // Start capturing audio from microphone
  const startAudioCapture = (stream: MediaStream, nativeSampleRate: number, ws: WebSocket) => {
    try {
      const audioContext = audioContextRef.current;
      if (!audioContext) return;
      
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create ScriptProcessor for audio capture (NOT connected to destination to avoid echo)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      // Create a gain node with zero gain as a "sink" to keep processor alive
      const silentNode = audioContext.createGain();
      silentNode.gain.value = 0;
      silentNode.connect(audioContext.destination);
      
      let audioChunksSent = 0;
      let lastLogTime = 0;
      
      processor.onaudioprocess = (e) => {
        const now = Date.now();
        
        // Only send audio when listening (not when Flo is speaking)
        if (ws.readyState === WebSocket.OPEN && voiceStateRef.current === 'listening') {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Calculate RMS for audio level visualization
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          setAudioLevel(Math.min(100, rms * 500));
          
          // Resample to 16kHz if needed
          const resampled = resample(inputData, nativeSampleRate, 16000);
          
          // Convert to base64-encoded 16-bit PCM
          const base64Audio = float32ToBase64Pcm16(resampled);
          
          // Send in ElevenLabs format
          ws.send(JSON.stringify({
            user_audio_chunk: base64Audio
          }));
          
          audioChunksSent++;
          // Log every 2 seconds
          if (now - lastLogTime > 2000) {
            console.log('[VoiceChat] Sending audio chunks, count:', audioChunksSent, 'rms:', rms.toFixed(4));
            lastLogTime = now;
          }
        } else if (now - lastLogTime > 2000) {
          // Log why we're not sending
          console.log('[VoiceChat] Not sending audio - wsReady:', ws.readyState === WebSocket.OPEN, 'state:', voiceStateRef.current);
          lastLogTime = now;
        }
      };
      
      source.connect(processor);
      processor.connect(silentNode);
      
      processorRef.current = processor;
    } catch (error) {
      console.error('[VoiceChat] Error starting audio capture:', error);
    }
  };

  // Handle WebSocket JSON messages from ElevenLabs
  const handleWebSocketMessage = async (data: any) => {
    console.log('[VoiceChat] Received:', data.type || 'unknown', 'voiceState:', voiceStateRef.current);
    
    if (data.type === 'audio' && data.audio_event?.audio_base_64) {
      // Audio from ElevenLabs TTS - decode and queue
      console.log('[VoiceChat] Queueing audio chunk, length:', data.audio_event.audio_base_64.length);
      const pcmData = base64PcmToFloat32(data.audio_event.audio_base_64);
      audioQueueRef.current.push(pcmData);
      
      if (!isPlayingRef.current) {
        playAudioQueue();
      }
    } else if (data.type === 'user_transcript' && data.user_transcription_event?.user_transcript) {
      // User's transcribed speech
      const transcript = data.user_transcription_event.user_transcript;
      if (transcript.trim()) {
        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          content: transcript,
          timestamp: new Date(),
          isVoice: true,
        };
        setMessages((prev) => [...prev, userMessage]);
      }
    } else if (data.type === 'agent_response' && data.agent_response_event?.agent_response) {
      // Flo's text response
      const response = data.agent_response_event.agent_response;
      if (response.trim()) {
        const floMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'flo',
          content: response,
          timestamp: new Date(),
          isVoice: true,
        };
        setMessages((prev) => [...prev, floMessage]);
      }
    } else if (data.type === 'ping' && data.ping_event?.event_id) {
      // Keepalive - respond with pong
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'pong',
          event_id: data.ping_event.event_id
        }));
      }
    } else if (data.type === 'interruption') {
      // User interrupted - stop current playback
      stopPlayback();
      setVoiceState('listening');
    }
  };

  // Play audio queue
  const playAudioQueue = async () => {
    console.log('[VoiceChat] playAudioQueue called, queue length:', audioQueueRef.current.length);
    
    if (audioQueueRef.current.length === 0) {
      console.log('[VoiceChat] Queue empty, switching to listening');
      isPlayingRef.current = false;
      setVoiceState('listening');
      return;
    }
    
    isPlayingRef.current = true;
    setVoiceState('speaking');
    
    const playbackContext = playbackContextRef.current;
    if (!playbackContext) {
      console.error('[VoiceChat] No playback context!');
      return;
    }
    
    // Concatenate all queued audio
    const totalLength = audioQueueRef.current.reduce((sum, arr) => sum + arr.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()!;
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Calculate expected duration for fallback timeout
    const durationSec = combined.length / 16000;
    console.log('[VoiceChat] Playing audio, samples:', combined.length, 'duration:', durationSec.toFixed(2), 's');
    
    try {
      // Create audio buffer at 16kHz
      const audioBuffer = playbackContext.createBuffer(1, combined.length, 16000);
      audioBuffer.copyToChannel(combined, 0);
      
      const source = playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContext.destination);
      
      currentSourceRef.current = source;
      
      // Fallback timeout in case onended doesn't fire (iOS issue)
      const fallbackTimeout = setTimeout(() => {
        console.log('[VoiceChat] Fallback timeout fired, checking state');
        if (isPlayingRef.current && audioQueueRef.current.length === 0) {
          console.log('[VoiceChat] Fallback: switching to listening');
          isPlayingRef.current = false;
          currentSourceRef.current = null;
          setVoiceState('listening');
        }
      }, (durationSec + 0.5) * 1000); // Add 500ms buffer
      
      source.onended = () => {
        console.log('[VoiceChat] Audio playback ended via onended');
        clearTimeout(fallbackTimeout);
        currentSourceRef.current = null;
        // Check if more audio arrived while playing
        if (audioQueueRef.current.length > 0) {
          playAudioQueue();
        } else {
          console.log('[VoiceChat] No more audio, switching to listening');
          isPlayingRef.current = false;
          setVoiceState('listening');
        }
      };
      
      source.start();
      console.log('[VoiceChat] Audio source started');
    } catch (error) {
      console.error('[VoiceChat] Error playing audio:', error);
      isPlayingRef.current = false;
      setVoiceState('listening');
    }
  };

  // Stop current playback
  const stopPlayback = () => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  // Disconnect voice - properly async to ensure cleanup completes
  const disconnectVoice = useCallback(async () => {
    stopPlayback();
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    await stopAudioCapture();
    setConnectionState('disconnected');
    setVoiceState('idle');
    setAudioLevel(0);
  }, []);

  const stopAudioCapture = async () => {
    // Stop native microphone capture if using iOS native
    if (isUsingNativeMicRef.current) {
      console.log('[VoiceChat] Stopping native microphone capture...');
      try {
        if (nativeListenerRef.current) {
          nativeListenerRef.current.remove();
          nativeListenerRef.current = null;
        }
        await stopNativeCapture();
      } catch (error) {
        console.error('[VoiceChat] Error stopping native capture:', error);
      } finally {
        // Always reset the flag, even on error
        isUsingNativeMicRef.current = false;
      }
    }
    
    // Stop web-based capture
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Toggle recording
  const handleVoiceToggle = async () => {
    if (connectionState === 'disconnected' || connectionState === 'error') {
      await connectVoice();
    } else if (connectionState === 'connected') {
      disconnectVoice();
    }
  };

  // Text fallback - send message via API
  const sendTextMessage = async (text: string) => {
    if (!text.trim() || isTextLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text.trim(),
      timestamp: new Date(),
      isVoice: false,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTextLoading(true);

    try {
      const response = await apiRequest('POST', '/api/flo-oracle/chat', {
        message: text.trim(),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from Flō Oracle');
      }

      const data = await response.json() as { response: string | { sanitizedOutput?: string } };

      let responseText: string;
      if (typeof data.response === 'string') {
        responseText = data.response;
      } else if (data.response && typeof data.response === 'object') {
        responseText = (data.response as any).sanitizedOutput || 'No response received';
      } else {
        responseText = 'No response received';
      }

      const floMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: responseText,
        timestamp: new Date(),
        isVoice: false,
      };
      setMessages((prev) => [...prev, floMessage]);
    } catch (error: any) {
      console.error('[FloOracle] Chat error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to get response. Please try again.",
        variant: "destructive",
      });
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
        isVoice: false,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTextLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSuggestionClick = (text: string) => {
    if (isVoiceMode && connectionState === 'connected') {
      // In voice mode, we could trigger TTS to speak this
      // For now, fall back to text
      sendTextMessage(text);
    } else {
      sendTextMessage(text);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendTextMessage(inputValue);
  };

  const isRecording = voiceState === 'listening' && connectionState === 'connected';
  const isSpeaking = voiceState === 'speaking';
  const isConnecting = connectionState === 'connecting';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 flex items-center justify-center p-4 z-50 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      data-testid="voice-chat-overlay"
    >
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl backdrop-blur-2xl border shadow-2xl overflow-hidden ${
          isDark 
            ? 'bg-slate-900/95 border-white/20 shadow-cyan-500/20' 
            : 'bg-white/95 border-white/40 shadow-gray-500/20'
        }`}
        data-testid="voice-chat-modal"
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <FloLogo size={32} />
                <motion.div
                  className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                    isSpeaking ? 'bg-cyan-500' : isRecording ? 'bg-red-500' : 'bg-gradient-to-r from-teal-500 to-cyan-500'
                  }`}
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [1, 0.7, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </div>
              <div>
                <h1 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Flō Oracle
                </h1>
                <div className="flex items-center gap-1">
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {isSpeaking ? 'Speaking...' : isRecording ? 'Listening...' : isConnecting ? 'Connecting...' : 'powered by'}
                  </p>
                  {!isSpeaking && !isRecording && !isConnecting && (
                    <img 
                      src={xaiLogo} 
                      alt="xAI" 
                      className={`h-3 ${isDark ? 'brightness-[3] invert' : 'brightness-50'}`}
                    />
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-full transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-chat"
            >
              <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                data-testid={`message-${message.type}`}
              >
                <div className={`max-w-[85%] ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                  {message.type === 'flo' && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <FloLogo size={16} />
                      <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        Flō Oracle
                      </span>
                      {message.isVoice && (
                        <Volume2 className={`w-3 h-3 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                      )}
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 backdrop-blur-xl ${
                      message.type === 'user'
                        ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25'
                        : isDark
                          ? 'bg-white/10 border border-white/10 text-white'
                          : 'bg-white/70 border border-white/20 text-gray-900'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {message.type === 'user' && message.isVoice && (
                        <Mic className="w-3 h-3 mt-0.5 flex-shrink-0 text-white/70" />
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <p className={`text-[10px] mt-1.5 ${
                      message.type === 'user' 
                        ? 'text-white/70' 
                        : isDark ? 'text-white/50' : 'text-gray-500'
                    }`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Flo Speaking Indicator */}
          {isSpeaking && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-start"
            >
              <div className="max-w-[85%]">
                <div className="flex items-center gap-2 mb-1.5">
                  <FloLogo size={16} />
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Flō Oracle
                  </span>
                </div>
                <div className={`rounded-2xl px-4 py-3 backdrop-blur-xl ${
                  isDark ? 'bg-white/10 border border-white/10' : 'bg-white/70 border border-white/20'
                }`}>
                  <div className="flex items-center gap-2">
                    <Volume2 className={`w-4 h-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <motion.div
                          key={i}
                          className={`w-1 h-3 rounded-full ${isDark ? 'bg-cyan-400' : 'bg-cyan-600'}`}
                          animate={{
                            scaleY: [1, 1.8, 1],
                          }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            delay: i * 0.1,
                          }}
                        />
                      ))}
                    </div>
                    <span className={`text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                      Speaking...
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Text mode loading indicator */}
          {isTextLoading && !isVoiceMode && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
              data-testid="flo-loading-indicator"
            >
              <div className="max-w-[85%]">
                <div className="flex items-center gap-2 mb-1.5">
                  <FloLogo size={16} />
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Flō Oracle
                  </span>
                </div>
                <div className={`rounded-2xl px-4 py-3 backdrop-blur-xl ${
                  isDark ? 'bg-white/10 border border-white/10' : 'bg-white/70 border border-white/20'
                }`}>
                  <div className="flex items-center gap-2">
                    <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                    <span className={`text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          
          {/* Quick Suggestions */}
          {messages.length === 1 && !isSpeaking && !isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-2 pt-2"
            >
              <p className={`text-xs text-center ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Quick suggestions:
              </p>
              <div className="grid grid-cols-1 gap-2">
                {quickSuggestions.map((suggestion, index) => {
                  const Icon = suggestion.icon;
                  return (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + index * 0.08 }}
                      onClick={() => handleSuggestionClick(suggestion.text)}
                      disabled={isTextLoading}
                      className={`flex items-center gap-3 p-2.5 rounded-xl backdrop-blur-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        isDark
                          ? 'bg-white/5 hover:bg-white/10 border border-white/10'
                          : 'bg-white/60 hover:bg-white/80 border border-white/20'
                      }`}
                      data-testid={`suggestion-${index}`}
                    >
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-r ${suggestion.color} flex items-center justify-center shadow-lg`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        {suggestion.text}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Voice/Input Control Area */}
        <div className={`px-5 py-5 border-t ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          {isVoiceMode ? (
            <>
              {/* Recording Waveform Visualization */}
              <AnimatePresence>
                {isRecording && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="mb-4"
                  >
                    <div className={`rounded-2xl p-4 backdrop-blur-xl ${
                      isDark ? 'bg-white/5 border border-white/10' : 'bg-white/60 border border-white/20'
                    }`}>
                      <div className="flex items-center justify-center gap-0.5 h-16 mb-3">
                        {[...Array(30)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="w-1 bg-gradient-to-t from-teal-500 via-cyan-500 to-blue-500 rounded-full"
                            animate={{
                              height: [
                                '20%',
                                `${Math.min(90, 20 + (audioLevel * Math.random()))}%`,
                                '20%',
                              ],
                            }}
                            transition={{
                              duration: 0.5,
                              repeat: Infinity,
                              ease: 'easeInOut',
                              delay: i * 0.03,
                            }}
                          />
                        ))}
                      </div>
                      <div className="text-center space-y-1">
                        <p className={`text-base ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                          {formatDuration(recordingDuration)}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          Listening to your voice...
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Central Voice Button */}
              <div className="flex flex-col items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleVoiceToggle}
                  disabled={isSpeaking || isConnecting}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl disabled:opacity-70 ${
                    isSpeaking || isConnecting
                      ? 'bg-gray-400 cursor-not-allowed'
                      : isRecording
                        ? 'bg-red-500 shadow-red-500/50'
                        : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 shadow-cyan-500/50'
                  }`}
                  data-testid="button-voice-toggle"
                >
                  {isConnecting ? (
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="w-7 h-7 text-white" />
                  ) : (
                    <Mic className="w-7 h-7 text-white" />
                  )}
                  
                  {/* Pulsing rings when idle */}
                  {!isRecording && !isSpeaking && !isConnecting && (
                    <>
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-cyan-500"
                        animate={{
                          scale: [1, 1.4, 1],
                          opacity: [0.5, 0, 0.5],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeOut',
                        }}
                      />
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-cyan-500"
                        animate={{
                          scale: [1, 1.4, 1],
                          opacity: [0.5, 0, 0.5],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeOut',
                          delay: 0.5,
                        }}
                      />
                    </>
                  )}

                  {/* Recording pulse effect */}
                  {isRecording && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-red-500"
                      animate={{
                        scale: [1, 1.3],
                        opacity: [0.5, 0],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  )}
                </motion.button>

                <div className="text-center">
                  <p className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {isConnecting ? 'Connecting...' : isSpeaking ? 'Flō is speaking' : isRecording ? 'Tap to stop' : 'Tap to speak'}
                  </p>
                  <p className={`text-xs mt-0.5 flex items-center justify-center gap-1 ${
                    isDark ? 'text-white/40' : 'text-gray-400'
                  }`}>
                    <Sparkles className="w-3 h-3" />
                    Voice-powered health insights
                  </p>
                </div>

                {/* Switch to text mode */}
                <button
                  onClick={() => setIsVoiceMode(false)}
                  className={`text-xs underline ${isDark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'}`}
                  data-testid="button-switch-to-text"
                >
                  Switch to text mode
                </button>
              </div>
            </>
          ) : (
            /* Text Input Fallback */
            <div className="space-y-3">
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isTextLoading}
                  placeholder="Ask about your health..."
                  className={`flex-1 px-4 py-2.5 rounded-xl backdrop-blur-xl transition-colors disabled:opacity-50 ${
                    isDark
                      ? 'bg-white/10 border border-white/10 text-white placeholder:text-white/50 focus:bg-white/15 focus:border-white/20'
                      : 'bg-white/70 border border-white/20 text-gray-900 placeholder:text-gray-500 focus:bg-white/90 focus:border-white/30'
                  } outline-none`}
                  data-testid="input-chat-message"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTextLoading}
                  className={`p-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    inputValue.trim() && !isTextLoading
                      ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/25'
                      : isDark
                        ? 'bg-white/10'
                        : 'bg-white/70'
                  }`}
                  data-testid="button-send-message"
                >
                  {isTextLoading ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Send className={`w-5 h-5 ${
                      inputValue.trim() ? 'text-white' : isDark ? 'text-white/50' : 'text-gray-500'
                    }`} />
                  )}
                </button>
              </form>
              
              {/* Switch to voice mode */}
              <button
                onClick={() => setIsVoiceMode(true)}
                className={`w-full text-xs flex items-center justify-center gap-1 ${isDark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'}`}
                data-testid="button-switch-to-voice"
              >
                <Mic className="w-3 h-3" />
                Switch to voice mode
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

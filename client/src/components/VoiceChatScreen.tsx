import { useState, useEffect, useRef } from 'react';
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

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking';

const quickSuggestions = [
  { icon: Activity, text: "What's my glucose trend?", color: "from-blue-500 to-cyan-500" },
  { icon: Heart, text: "Review my heart health", color: "from-red-500 to-pink-500" },
  { icon: Moon, text: "Analyze my sleep quality", color: "from-purple-500 to-indigo-500" },
  { icon: TrendingUp, text: "Show recent improvements", color: "from-green-500 to-emerald-500" },
];

export function VoiceChatScreen({ isDark, onClose }: VoiceChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'flo',
      content: "Hi there! I'm Flō Oracle, your personal health AI. Tap and hold the mic to speak, then release to get my response.",
      timestamp: new Date(),
      isVoice: false,
    },
  ]);
  
  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  
  // Text fallback state
  const [inputValue, setInputValue] = useState('');
  const [isTextLoading, setIsTextLoading] = useState(false);
  
  // Conversation history for context
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeAudioDataRef = useRef<string[]>([]); // Stores base64 audio chunks from native mic
  const nativeListenerRef = useRef<{ remove: () => void } | null>(null);
  const isUsingNativeMicRef = useRef(false);
  
  const { toast } = useToast();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Recording duration timer
  useEffect(() => {
    if (voiceState === 'recording') {
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
      stopRecording();
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize playback audio context
  const initPlaybackContext = async () => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext();
    }
    if (playbackContextRef.current.state === 'suspended') {
      await playbackContextRef.current.resume();
    }
    return playbackContextRef.current;
  };

  // Start recording audio
  const startRecording = async () => {
    try {
      setVoiceState('recording');
      setAudioLevel(0);
      audioChunksRef.current = [];
      nativeAudioDataRef.current = [];
      
      // Check if we should use native microphone (iOS)
      const useNativeMic = isNativeMicrophoneAvailable();
      isUsingNativeMicRef.current = useNativeMic;
      console.log('[VoiceChat] Using native microphone:', useNativeMic);
      
      if (useNativeMic) {
        // iOS: Start native capture
        await startNativeCapture();
        
        // Register listener to collect audio data
        const listener = await addAudioDataListener((event: AudioDataEvent) => {
          if (event.audio && event.sampleCount > 0) {
            nativeAudioDataRef.current.push(event.audio);
            setAudioLevel(Math.min(100, event.rms * 500));
          }
        });
        nativeListenerRef.current = listener;
      } else {
        // Web fallback: Use MediaRecorder
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          } 
        });
        mediaStreamRef.current = stream;
        
        // Create MediaRecorder for capturing audio
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100); // Collect data every 100ms
        
        // Set up audio level monitoring
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (voiceState === 'recording') {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            setAudioLevel(Math.min(100, average * 1.5));
            requestAnimationFrame(updateLevel);
          }
        };
        updateLevel();
      }
    } catch (error: any) {
      console.error('[VoiceChat] Error starting recording:', error);
      setVoiceState('idle');
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Microphone access denied",
          description: "Please allow microphone access to use voice chat.",
          variant: "destructive",
        });
        setIsVoiceMode(false);
      } else {
        toast({
          title: "Recording failed",
          description: error.message || "Could not start recording.",
          variant: "destructive",
        });
      }
    }
  };

  // Stop recording and process audio
  const stopRecording = async () => {
    if (voiceState !== 'recording') return;
    
    console.log('[VoiceChat] Stopping recording...');
    setVoiceState('processing');
    
    let audioBase64: string | null = null;
    
    try {
      if (isUsingNativeMicRef.current) {
        // iOS: Stop native capture and get collected audio
        await stopNativeCapture();
        if (nativeListenerRef.current) {
          nativeListenerRef.current.remove();
          nativeListenerRef.current = null;
        }
        
        // Combine all collected audio chunks
        if (nativeAudioDataRef.current.length > 0) {
          // For native, audio is already base64 PCM - combine it
          audioBase64 = combineBase64PcmChunks(nativeAudioDataRef.current);
          console.log('[VoiceChat] Combined native audio, length:', audioBase64.length);
        }
      } else {
        // Web: Stop MediaRecorder and get blob
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          await new Promise<void>((resolve) => {
            mediaRecorderRef.current!.onstop = () => resolve();
            mediaRecorderRef.current!.stop();
          });
        }
        
        // Stop media stream
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
        
        // Close audio context
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        
        // Convert blob to base64
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioBase64 = await blobToBase64(blob);
          console.log('[VoiceChat] Converted web audio to base64, length:', audioBase64.length);
        }
      }
      
      // Check if we have audio to process
      if (!audioBase64 || audioBase64.length < 100) {
        console.log('[VoiceChat] No audio recorded or audio too short');
        setVoiceState('idle');
        toast({
          title: "No audio detected",
          description: "Please try speaking louder or longer.",
          variant: "default",
        });
        return;
      }
      
      // Send to speech relay endpoint
      await processAudioWithSpeechRelay(audioBase64);
      
    } catch (error: any) {
      console.error('[VoiceChat] Error stopping recording:', error);
      setVoiceState('idle');
      toast({
        title: "Processing failed",
        description: error.message || "Could not process your voice message.",
        variant: "destructive",
      });
    }
  };

  // Process audio through the speech relay
  const processAudioWithSpeechRelay = async (audioBase64: string) => {
    try {
      console.log('[VoiceChat] Sending audio to speech relay...');
      
      const response = await apiRequest('POST', '/api/voice/speech-relay', {
        audioBase64,
        conversationHistory,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process voice');
      }
      
      const result = await response.json() as {
        transcript: string;
        response: string;
        audioBase64: string;
        audioFormat: string;
      };
      
      console.log('[VoiceChat] Received response:', {
        transcriptLength: result.transcript.length,
        responseLength: result.response.length,
        audioLength: result.audioBase64.length,
      });
      
      // Add user message to UI
      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: result.transcript,
        timestamp: new Date(),
        isVoice: true,
      };
      setMessages((prev) => [...prev, userMessage]);
      
      // Add Flo's response to UI
      const floMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: result.response,
        timestamp: new Date(),
        isVoice: true,
      };
      setMessages((prev) => [...prev, floMessage]);
      
      // Update conversation history
      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: result.transcript },
        { role: 'assistant', content: result.response },
      ]);
      
      // Play audio response
      await playAudioResponse(result.audioBase64);
      
    } catch (error: any) {
      console.error('[VoiceChat] Speech relay error:', error);
      setVoiceState('idle');
      throw error;
    }
  };

  // Play audio response (MP3 from OpenAI TTS)
  const playAudioResponse = async (audioBase64: string) => {
    try {
      setVoiceState('speaking');
      
      // Use HTML5 Audio for MP3 playback (works on both iOS and web)
      console.log('[VoiceChat] Playing MP3 audio via HTML5 Audio...');
      
      // Create data URL from base64
      const audioDataUrl = `data:audio/mp3;base64,${audioBase64}`;
      const audio = new Audio(audioDataUrl);
      
      audio.onended = () => {
        console.log('[VoiceChat] Audio playback ended');
        setVoiceState('idle');
      };
      
      audio.onerror = (e) => {
        console.error('[VoiceChat] Audio playback error:', e);
        setVoiceState('idle');
      };
      
      await audio.play();
      
    } catch (error: any) {
      console.error('[VoiceChat] Error playing audio:', error);
      setVoiceState('idle');
    }
  };

  // Helper to convert Blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix (e.g., "data:audio/webm;base64,")
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Helper to combine base64 PCM chunks
  const combineBase64PcmChunks = (chunks: string[]): string => {
    // Decode all chunks to binary
    const binaryChunks = chunks.map(chunk => atob(chunk));
    
    // Calculate total length
    const totalLength = binaryChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    
    // Combine into single array
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of binaryChunks) {
      for (let i = 0; i < chunk.length; i++) {
        combined[offset++] = chunk.charCodeAt(i);
      }
    }
    
    // Convert back to base64
    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  };

  // Handle voice toggle button
  const handleVoiceToggle = () => {
    if (voiceState === 'idle') {
      startRecording();
    } else if (voiceState === 'recording') {
      stopRecording();
    }
    // Ignore if processing or speaking
  };

  // Handle text submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isTextLoading) return;
    
    setInputValue('');
    setIsTextLoading(true);
    
    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date(),
      isVoice: false,
    };
    setMessages((prev) => [...prev, userMessage]);
    
    try {
      // Use text chat endpoint (existing Flo Oracle)
      const response = await apiRequest('POST', '/api/flo-oracle/chat', {
        message: text,
        history: conversationHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        })),
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response');
      }
      
      const result = await response.json();
      
      // Add Flo's response
      const floMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: result.response,
        timestamp: new Date(),
        isVoice: false,
      };
      setMessages((prev) => [...prev, floMessage]);
      
      // Update conversation history
      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: result.response },
      ]);
      
    } catch (error: any) {
      console.error('[VoiceChat] Text chat error:', error);
      toast({
        title: "Message failed",
        description: "Could not send your message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTextLoading(false);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (text: string) => {
    if (isVoiceMode) {
      // In voice mode, switch to text and send the suggestion
      setIsVoiceMode(false);
      setInputValue(text);
      // Auto-submit after a short delay
      setTimeout(() => {
        handleSubmit({ preventDefault: () => {} } as React.FormEvent);
      }, 100);
    } else {
      setInputValue(text);
      inputRef.current?.focus();
    }
  };

  const isRecording = voiceState === 'recording';
  const isSpeaking = voiceState === 'speaking';
  const isProcessing = voiceState === 'processing';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0f0f1a 100%)'
          : 'linear-gradient(135deg, #f0f4f8 0%, #e8eef5 50%, #f5f7fa 100%)',
      }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 ${
        isDark ? 'border-b border-white/10' : 'border-b border-black/10'
      }`}>
        <div className="flex items-center gap-3">
          <FloLogo size={28} />
          <div>
            <h1 className={`text-base font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Flō Oracle
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <img src={xaiLogo} alt="Grok" className="w-3 h-3 opacity-60" />
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                Powered by Grok
              </span>
            </div>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className={`p-2 rounded-full backdrop-blur-xl transition-colors ${
            isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10'
          }`}
          data-testid="button-close-chat"
        >
          <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-700'}`} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] ${message.type === 'user' ? 'order-1' : ''}`}>
                {message.type === 'flo' && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <FloLogo size={16} />
                    <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Flō Oracle
                    </span>
                    {message.isVoice && (
                      <Volume2 className={`w-3 h-3 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
                    )}
                  </div>
                )}
                {message.type === 'user' && (
                  <div className="flex items-center gap-2 mb-1.5 justify-end">
                    {message.isVoice && (
                      <Mic className={`w-3 h-3 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
                    )}
                    <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      You
                    </span>
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 backdrop-blur-xl ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white'
                      : isDark
                        ? 'bg-white/10 border border-white/10'
                        : 'bg-white/70 border border-white/20'
                  }`}
                >
                  <p className={`text-sm leading-relaxed ${
                    message.type === 'user' 
                      ? 'text-white' 
                      : isDark ? 'text-white/90' : 'text-gray-800'
                  }`}>
                    {message.content}
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

        {/* Processing Indicator */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
            data-testid="flo-processing-indicator"
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
                    Processing your voice...
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
        {messages.length === 1 && !isSpeaking && !isRecording && !isProcessing && (
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
                        Tap the mic again to send
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
                disabled={isSpeaking || isProcessing}
                className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl disabled:opacity-70 ${
                  isSpeaking || isProcessing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : isRecording
                      ? 'bg-red-500 shadow-red-500/50'
                      : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 shadow-cyan-500/50'
                }`}
                data-testid="button-voice-toggle"
              >
                {isProcessing ? (
                  <Loader2 className="w-7 h-7 text-white animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-7 h-7 text-white" />
                ) : (
                  <Mic className="w-7 h-7 text-white" />
                )}
                
                {/* Pulsing rings when idle */}
                {!isRecording && !isSpeaking && !isProcessing && (
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
                  {isProcessing ? 'Processing...' : isSpeaking ? 'Flō is speaking' : isRecording ? 'Tap to send' : 'Tap to speak'}
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
  );
}

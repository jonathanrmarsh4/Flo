import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, Volume2, Activity, Heart, Moon, TrendingUp, Loader2, Send, Square, Phone, PhoneOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FloLogo } from './FloLogo';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import xaiLogo from '@assets/xai-logo.svg';

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

const SILENCE_THRESHOLD = 8;
const SILENCE_DURATION_MS = 1500;
const MIN_RECORDING_MS = 500;
const AUTO_RESUME_DELAY_MS = 400;

export function VoiceChatScreen({ isDark, onClose }: VoiceChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'flo',
      content: "Tap the phone icon to start - I'll greet you and we can explore your health data together.",
      timestamp: new Date(),
      isVoice: false,
    },
  ]);
  
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isConversationActive, setIsConversationActive] = useState(false);
  
  const [inputValue, setInputValue] = useState('');
  const [isTextLoading, setIsTextLoading] = useState(false);
  
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioMimeTypeRef = useRef<string>('audio/webm');
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const hasSpokenRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const shouldContinueRef = useRef<boolean>(false);
  const autoResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      shouldContinueRef.current = false;
      if (autoResumeTimeoutRef.current) {
        clearTimeout(autoResumeTimeoutRef.current);
      }
      cleanupRecording();
    };
  }, []);

  const cleanupRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    
    setAudioLevel(0);
  }, []);

  const startRecordingInternal = useCallback(async () => {
    try {
      console.log('[VoiceChat] Starting recording with VAD...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      silenceStartRef.current = null;
      hasSpokenRef.current = false;
      recordingStartRef.current = Date.now();
      isProcessingRef.current = false;
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      audioMimeTypeRef.current = mimeType;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('[VoiceChat] MediaRecorder stopped, processing...');
        processRecordingInternal();
      };
      
      mediaRecorder.start(100);
      setVoiceState('recording');
      
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkAudioLevel = () => {
        if (!analyserRef.current || !mediaRecorderRef.current) {
          return;
        }
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalizedLevel = Math.min(100, average * 1.5);
        setAudioLevel(normalizedLevel);
        
        const now = Date.now();
        const recordingDuration = now - (recordingStartRef.current || now);
        
        if (average > SILENCE_THRESHOLD) {
          hasSpokenRef.current = true;
          silenceStartRef.current = null;
        } else if (hasSpokenRef.current && recordingDuration > MIN_RECORDING_MS) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
            console.log('[VoiceChat] Silence detected, auto-stopping...');
            stopRecordingInternal();
            return;
          }
        }
        
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
      
      console.log('[VoiceChat] Recording started with VAD');
      
    } catch (error: any) {
      console.error('[VoiceChat] Failed to start recording:', error);
      shouldContinueRef.current = false;
      setIsConversationActive(false);
      
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
          description: "Could not start recording. Please try again.",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const stopRecordingInternal = useCallback(() => {
    console.log('[VoiceChat] Stopping recording...');
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    setAudioLevel(0);
  }, []);

  const processRecordingInternal = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (audioChunksRef.current.length === 0) {
      console.log('[VoiceChat] No audio recorded');
      if (shouldContinueRef.current) {
        autoResumeTimeoutRef.current = setTimeout(() => {
          if (shouldContinueRef.current) {
            startRecordingInternal();
          }
        }, AUTO_RESUME_DELAY_MS);
      } else {
        setVoiceState('idle');
        setIsConversationActive(false);
      }
      return;
    }
    
    isProcessingRef.current = true;
    setVoiceState('processing');
    
    try {
      const audioBlob = new Blob(audioChunksRef.current, { 
        type: audioMimeTypeRef.current 
      });
      
      console.log('[VoiceChat] Processing audio:', audioBlob.size, 'bytes, type:', audioMimeTypeRef.current);
      
      if (audioBlob.size < 1000) {
        console.log('[VoiceChat] Audio too short, skipping');
        isProcessingRef.current = false;
        if (shouldContinueRef.current) {
          autoResumeTimeoutRef.current = setTimeout(() => {
            if (shouldContinueRef.current) {
              startRecordingInternal();
            }
          }, AUTO_RESUME_DELAY_MS);
        } else {
          setVoiceState('idle');
          setIsConversationActive(false);
        }
        return;
      }
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      console.log('[VoiceChat] Sending to speech relay...');
      
      const response = await apiRequest('POST', '/api/voice/speech-relay', {
        audioBase64: base64Audio,
        audioMimeType: audioMimeTypeRef.current,
        conversationHistory
      });
      
      const result = await response.json() as {
        transcript: string;
        response: string;
        audioBase64: string;
        audioFormat: string;
      };
      
      console.log('[VoiceChat] Received response:', {
        transcriptLength: result.transcript.length,
        responseLength: result.response.length,
        audioLength: result.audioBase64.length
      });
      
      if (!result.transcript || result.transcript.length < 2) {
        console.log('[VoiceChat] Empty transcript, continuing to listen...');
        isProcessingRef.current = false;
        if (shouldContinueRef.current) {
          autoResumeTimeoutRef.current = setTimeout(() => {
            if (shouldContinueRef.current) {
              startRecordingInternal();
            }
          }, AUTO_RESUME_DELAY_MS);
        } else {
          setVoiceState('idle');
          setIsConversationActive(false);
        }
        return;
      }
      
      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: result.transcript,
        timestamp: new Date(),
        isVoice: true,
      };
      
      const floMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: result.response,
        timestamp: new Date(),
        isVoice: true,
      };
      
      setMessages(prev => [...prev, userMessage, floMessage]);
      
      setConversationHistory(prev => [
        ...prev,
        { role: 'user' as const, content: result.transcript },
        { role: 'assistant' as const, content: result.response }
      ].slice(-20));
      
      setVoiceState('speaking');
      
      const audioData = Uint8Array.from(atob(result.audioBase64), c => c.charCodeAt(0));
      const audioBlob2 = new Blob([audioData], { type: `audio/${result.audioFormat}` });
      const audioUrl = URL.createObjectURL(audioBlob2);
      
      const audioEl = new Audio(audioUrl);
      audioElementRef.current = audioEl;
      
      audioEl.onended = () => {
        console.log('[VoiceChat] Audio playback ended, shouldContinue:', shouldContinueRef.current);
        URL.revokeObjectURL(audioUrl);
        isProcessingRef.current = false;
        
        if (shouldContinueRef.current) {
          autoResumeTimeoutRef.current = setTimeout(() => {
            if (shouldContinueRef.current) {
              console.log('[VoiceChat] Auto-resuming recording...');
              startRecordingInternal();
            }
          }, AUTO_RESUME_DELAY_MS);
        } else {
          setVoiceState('idle');
          setIsConversationActive(false);
        }
      };
      
      audioEl.onerror = () => {
        console.error('[VoiceChat] Audio playback error');
        URL.revokeObjectURL(audioUrl);
        isProcessingRef.current = false;
        
        if (shouldContinueRef.current) {
          autoResumeTimeoutRef.current = setTimeout(() => {
            if (shouldContinueRef.current) {
              startRecordingInternal();
            }
          }, AUTO_RESUME_DELAY_MS);
        } else {
          setVoiceState('idle');
          setIsConversationActive(false);
        }
      };
      
      await audioEl.play();
      
    } catch (error: any) {
      console.error('[VoiceChat] Processing failed:', error);
      
      toast({
        title: "Voice processing failed",
        description: error.message || "Could not process your voice. Please try again.",
        variant: "destructive",
      });
      
      isProcessingRef.current = false;
      shouldContinueRef.current = false;
      setVoiceState('idle');
      setIsConversationActive(false);
    }
  }, [conversationHistory, toast, startRecordingInternal]);

  const startConversation = useCallback(async () => {
    console.log('[VoiceChat] Starting conversation with AI greeting...');
    shouldContinueRef.current = true;
    setIsConversationActive(true);
    setVoiceState('processing');
    
    try {
      // First, get AI greeting
      const response = await apiRequest('POST', '/api/voice/greeting', {});
      const result = await response.json() as {
        greeting: string;
        audioBase64: string;
        audioFormat: string;
      };
      
      console.log('[VoiceChat] Received greeting:', result.greeting.substring(0, 50) + '...');
      
      // Add greeting to messages
      const greetingMessage: Message = {
        id: Date.now().toString(),
        type: 'flo',
        content: result.greeting,
        timestamp: new Date(),
        isVoice: true,
      };
      setMessages(prev => [...prev, greetingMessage]);
      
      // Add to conversation history
      setConversationHistory(prev => [
        ...prev,
        { role: 'assistant' as const, content: result.greeting }
      ]);
      
      // Play greeting audio
      setVoiceState('speaking');
      
      const audioData = Uint8Array.from(atob(result.audioBase64), c => c.charCodeAt(0));
      const audioBlob = new Blob([audioData], { type: `audio/${result.audioFormat}` });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audioEl = new Audio(audioUrl);
      audioElementRef.current = audioEl;
      
      audioEl.onended = () => {
        console.log('[VoiceChat] Greeting playback ended, starting to listen...');
        URL.revokeObjectURL(audioUrl);
        
        // After greeting ends, start listening for user's response
        if (shouldContinueRef.current) {
          autoResumeTimeoutRef.current = setTimeout(() => {
            if (shouldContinueRef.current) {
              startRecordingInternal();
            }
          }, AUTO_RESUME_DELAY_MS);
        }
      };
      
      audioEl.onerror = () => {
        console.error('[VoiceChat] Greeting audio error');
        URL.revokeObjectURL(audioUrl);
        
        // Still start listening even if audio failed
        if (shouldContinueRef.current) {
          startRecordingInternal();
        }
      };
      
      await audioEl.play();
      
    } catch (error: any) {
      console.error('[VoiceChat] Failed to get greeting:', error);
      
      // Fallback: just start listening without greeting
      toast({
        title: "Couldn't start with greeting",
        description: "Starting to listen now...",
        variant: "destructive",
      });
      
      await startRecordingInternal();
    }
  }, [startRecordingInternal, toast]);

  const endConversation = useCallback(() => {
    console.log('[VoiceChat] Ending conversation...');
    shouldContinueRef.current = false;
    
    if (autoResumeTimeoutRef.current) {
      clearTimeout(autoResumeTimeoutRef.current);
      autoResumeTimeoutRef.current = null;
    }
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    
    cleanupRecording();
    setVoiceState('idle');
    setIsConversationActive(false);
    isProcessingRef.current = false;
  }, [cleanupRecording]);

  const handleMicPress = useCallback(() => {
    if (!isConversationActive) {
      startConversation();
    } else {
      endConversation();
    }
  }, [isConversationActive, startConversation, endConversation]);

  const handleTextSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!inputValue.trim() || isTextLoading) return;
    
    const text = inputValue.trim();
    setInputValue('');
    setIsTextLoading(true);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date(),
      isVoice: false,
    };
    setMessages(prev => [...prev, userMessage]);
    
    try {
      const response = await apiRequest('POST', '/api/flo-oracle/chat', {
        message: text,
        conversationHistory
      });
      
      const result = await response.json() as { reply: string };
      
      const floMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: result.reply,
        timestamp: new Date(),
        isVoice: false,
      };
      
      setMessages(prev => [...prev, floMessage]);
      
      setConversationHistory(prev => [
        ...prev,
        { role: 'user' as const, content: text },
        { role: 'assistant' as const, content: result.reply }
      ].slice(-20));
      
    } catch (error: any) {
      console.error('[VoiceChat] Text chat failed:', error);
      
      toast({
        title: "Message failed",
        description: "Could not send message. Please try again.",
        variant: "destructive",
      });
      
    } finally {
      setIsTextLoading(false);
    }
  }, [inputValue, isTextLoading, conversationHistory, toast]);

  const handleQuickSuggestion = useCallback((text: string) => {
    setInputValue(text);
    setIsVoiceMode(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const handleSwitchToText = useCallback(() => {
    endConversation();
    setIsVoiceMode(false);
  }, [endConversation]);

  const isRecording = voiceState === 'recording';
  const isProcessing = voiceState === 'processing';
  const isSpeaking = voiceState === 'speaking';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
      }}
    >
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={`relative w-full max-w-lg h-[85vh] max-h-[700px] flex flex-col rounded-3xl overflow-hidden ${
          isDark 
            ? 'bg-white/5 border border-white/10' 
            : 'bg-white/70 border border-white/50'
        }`}
        style={{
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          boxShadow: isDark
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        }}
      >
        <div className={`flex items-center justify-between px-5 py-4 ${
          isDark ? 'border-b border-white/10' : 'border-b border-black/5'
        }`}>
          <div className="flex items-center gap-3">
            <FloLogo size={28} />
            <div>
              <h1 className={`text-base font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Flō Oracle
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <img src={xaiLogo} alt="xAI" className="w-3 h-3 opacity-50" />
                <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                  Powered by Grok
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isConversationActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                  isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </motion.div>
            )}
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
        </div>

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
                    className={`px-4 py-3 rounded-2xl ${
                      message.type === 'user'
                        ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white'
                        : isDark
                          ? 'bg-white/10 text-white/90'
                          : 'bg-white text-gray-900 shadow-sm'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className={`px-4 py-3 rounded-2xl ${
                isDark ? 'bg-white/10' : 'bg-white shadow-sm'
              }`}>
                <div className="flex items-center gap-2">
                  <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                  <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    Thinking...
                  </span>
                </div>
              </div>
            </motion.div>
          )}
          
          {messages.length === 1 && !isConversationActive && (
            <div className="mt-4">
              <p className={`text-center text-xs mb-3 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                Quick suggestions:
              </p>
              <div className="space-y-2">
                {quickSuggestions.map((suggestion, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => handleQuickSuggestion(suggestion.text)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isDark
                        ? 'bg-white/5 hover:bg-white/10 border border-white/10'
                        : 'bg-white/50 hover:bg-white/80 border border-white/20'
                    }`}
                    data-testid={`button-suggestion-${index}`}
                  >
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-r ${suggestion.color} flex items-center justify-center`}>
                      <suggestion.icon className="w-4 h-4 text-white" />
                    </div>
                    <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                      {suggestion.text}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className={`px-5 py-5 border-t ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          {isVoiceMode ? (
            <>
              <div className="flex flex-col items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleMicPress}
                  disabled={isProcessing}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl disabled:opacity-70 ${
                    isConversationActive
                      ? isRecording
                        ? 'bg-red-500 shadow-red-500/50'
                        : isSpeaking
                          ? 'bg-purple-500 shadow-purple-500/50'
                          : 'bg-orange-500 shadow-orange-500/50'
                      : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 shadow-cyan-500/50'
                  }`}
                  data-testid="button-voice-toggle"
                >
                  {isProcessing ? (
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                  ) : isConversationActive ? (
                    <PhoneOff className="w-6 h-6 text-white" />
                  ) : (
                    <Phone className="w-7 h-7 text-white" />
                  )}
                  
                  {isRecording && (
                    <>
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-red-400"
                        animate={{
                          scale: [1, 1.3 + (audioLevel / 100) * 0.3, 1],
                          opacity: [0.6, 0.2, 0.6],
                        }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-red-300"
                        animate={{
                          scale: [1, 1.5 + (audioLevel / 100) * 0.5, 1],
                          opacity: [0.4, 0.1, 0.4],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                    </>
                  )}
                  
                  {isSpeaking && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-purple-400"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.6, 0.2, 0.6],
                      }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                  
                  {isConversationActive && !isRecording && !isSpeaking && !isProcessing && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-orange-400"
                      animate={{
                        opacity: [0.4, 0.8, 0.4],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </motion.button>
                
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  {isConversationActive
                    ? isRecording 
                      ? 'Listening...' 
                      : isSpeaking
                        ? 'Flō is speaking...'
                        : isProcessing
                          ? 'Processing...'
                          : 'Tap to end call'
                    : 'Tap to start call'
                  }
                </p>
                
                <p className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                  {isConversationActive
                    ? 'Conversation stays open until you hang up'
                    : 'Have a natural conversation with Flō'
                  }
                </p>
              </div>
              
              <button
                onClick={handleSwitchToText}
                className={`w-full mt-3 text-xs flex items-center justify-center gap-1 ${isDark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'}`}
                data-testid="button-switch-to-text"
              >
                <Send className="w-3 h-3" />
                Switch to text mode
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <form onSubmit={handleTextSubmit} className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isTextLoading}
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
              
              <button
                onClick={() => setIsVoiceMode(true)}
                className={`w-full text-xs flex items-center justify-center gap-1 ${isDark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'}`}
                data-testid="button-switch-to-voice"
              >
                <Phone className="w-3 h-3" />
                Switch to voice mode
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

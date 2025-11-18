import { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Volume2, Sparkles, Activity, Heart, Moon, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FloLogo } from './FloLogo';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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
      content: "Hi there! I'm Flo, your personal health assistant. Tap the mic button to start our conversation.",
      timestamp: new Date(),
      isVoice: false,
    },
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
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
  }, [isRecording]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initializeSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Voice not supported",
        description: "Your browser doesn't support voice recognition. Try Chrome or Safari.",
        variant: "destructive",
      });
      return null;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    return recognition;
  };

  const sendMessageToGrok = async (userMessage: string) => {
    setIsProcessing(true);
    
    try {
      const conversationHistory = messages.filter(m => m.id !== '1').map(m => ({
        type: m.type,
        content: m.content,
      }));

      const response = await apiRequest({
        method: 'POST',
        url: '/api/chat/grok',
        body: {
          message: userMessage,
          conversationHistory,
        },
      }) as { response: string; violation: boolean };

      const floMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: response.response,
        timestamp: new Date(),
        isVoice: true,
      };

      setMessages((prev) => [...prev, floMessage]);
      
      speakText(response.response);
    } catch (error: any) {
      console.error('[VoiceChat] Error sending message:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
        isVoice: false,
      };
      
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoiceMessage = (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: content.trim(),
      timestamp: new Date(),
      isVoice: true,
    };
    setMessages((prev) => [...prev, userMessage]);
    
    sendMessageToGrok(content.trim());
  };

  const speakText = (text: string) => {
    if (!synthRef.current) return;

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    const voices = synthRef.current.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.name.includes('Samantha') || 
      voice.name.includes('Karen') ||
      voice.name.includes('Female')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  };

  const handleRecordToggle = () => {
    if (!isRecording) {
      const recognition = initializeSpeechRecognition();
      if (!recognition) return;

      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleVoiceMessage(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('[VoiceChat] Speech recognition error:', event.error);
        setIsRecording(false);
        
        if (event.error === 'not-allowed') {
          toast({
            title: "Microphone access denied",
            description: "Please allow microphone access in your browser settings.",
            variant: "destructive",
          });
        } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
          toast({
            title: "Voice recognition error",
            description: "There was a problem with voice recognition. Please try again.",
            variant: "destructive",
          });
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      try {
        recognition.start();
      } catch (error) {
        console.error('[VoiceChat] Failed to start recognition:', error);
        setIsRecording(false);
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
    }
  };

  const handleSuggestionClick = (text: string) => {
    handleVoiceMessage(text);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
        <div className={`px-5 py-4 border-b ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <FloLogo size={32} />
                <motion.div
                  className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                    isSpeaking ? 'bg-cyan-500' : 'bg-green-500'
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
                <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Chat with Flo
                </h1>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  {isSpeaking ? 'Flo is speaking...' : isRecording ? 'Listening...' : isProcessing ? 'Thinking...' : 'Voice assistant'}
                </p>
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
                        Flo
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
                        <Mic className={`w-3 h-3 mt-0.5 flex-shrink-0 text-white/70`} />
                      )}
                      <p className="text-sm leading-relaxed">{message.content}</p>
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

          {(isSpeaking || isProcessing) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-start"
              data-testid="flo-speaking-indicator"
            >
              <div className="max-w-[85%]">
                <div className="flex items-center gap-2 mb-1.5">
                  <FloLogo size={16} />
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Flo
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
                      {isProcessing ? 'Thinking...' : 'Speaking...'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          
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
                      className={`flex items-center gap-3 p-2.5 rounded-xl backdrop-blur-xl transition-all ${
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

        <div className={`px-5 py-5 border-t ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
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

          <div className="flex flex-col items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleRecordToggle}
              disabled={isSpeaking || isProcessing}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl ${
                isSpeaking || isProcessing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : isRecording
                    ? 'bg-red-500 shadow-red-500/50'
                    : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 shadow-cyan-500/50'
              }`}
              data-testid="button-voice-toggle"
            >
              {isRecording ? (
                <MicOff className="w-7 h-7 text-white" />
              ) : (
                <Mic className="w-7 h-7 text-white" />
              )}
              
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
                {isSpeaking ? 'Flo is speaking' : isProcessing ? 'Processing...' : isRecording ? 'Tap to stop' : 'Tap to speak'}
              </p>
              <p className={`text-xs mt-0.5 flex items-center justify-center gap-1 ${
                isDark ? 'text-white/40' : 'text-gray-400'
              }`}>
                <Sparkles className="w-3 h-3" />
                Voice-powered health insights
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

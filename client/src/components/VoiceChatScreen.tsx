import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, Volume2, Activity, Heart, Moon, TrendingUp, Loader2, Send, Phone, PhoneOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FloLogo } from './FloLogo';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useGeminiLiveVoice } from '@/hooks/useGeminiLiveVoice';

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
  initialContext?: string;
}

const quickSuggestions = [
  { icon: Activity, text: "What's my glucose trend?", color: "from-blue-500 to-cyan-500" },
  { icon: Heart, text: "Review my heart health", color: "from-red-500 to-pink-500" },
  { icon: Moon, text: "Analyze my sleep quality", color: "from-purple-500 to-indigo-500" },
  { icon: TrendingUp, text: "Show recent improvements", color: "from-green-500 to-emerald-500" },
];

export function VoiceChatScreen({ isDark, onClose, initialContext }: VoiceChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'flo',
      content: initialContext 
        ? "I see you want to discuss your morning briefing. Tap the phone icon and let's dive into your health insights!"
        : "Tap the phone icon to start - I'll greet you and we can explore your health data together.",
      timestamp: new Date(),
      isVoice: false,
    },
  ]);
  
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isConnecting, setIsConnecting] = useState(false); // Explicit connecting state
  
  // Use ref for accumulated transcript to avoid stale closure in callback
  const accumulatedTranscriptRef = useRef('');
  const initialContextRef = useRef(initialContext);
  
  // Keep ref updated when initialContext prop changes (important for pre-rendered component)
  useEffect(() => {
    initialContextRef.current = initialContext;
    // Update the initial message when context changes
    if (initialContext) {
      setMessages([{
        id: '1',
        type: 'flo',
        content: "I see you want to discuss your morning briefing. Tap the phone icon and let's dive into your health insights!",
        timestamp: new Date(),
        isVoice: false,
      }]);
    }
  }, [initialContext]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();

  // Use Gemini Live for voice
  const {
    isConnected,
    isListening,
    isSpeaking,
    error: geminiError,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText,
  } = useGeminiLiveVoice({
    onTranscript: (text, isFinal) => {
      console.log('[VoiceChat] Transcript:', text, 'Final:', isFinal);
      
      // Accumulate transcript chunks within a turn using ref
      const prev = accumulatedTranscriptRef.current;
      const newAccumulated = prev + (prev && text ? ' ' : '') + (text || '');
      accumulatedTranscriptRef.current = newAccumulated;
      setCurrentTranscript(newAccumulated); // Display accumulated text
      
      if (isFinal && newAccumulated.trim()) {
        // Add user message with FULL accumulated transcript
        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          content: newAccumulated.trim(),
          timestamp: new Date(),
          isVoice: true,
        };
        setMessages(prev => [...prev, userMessage]);
        setCurrentTranscript('');
        accumulatedTranscriptRef.current = ''; // Reset for next turn
        
        // Update conversation history with accumulated transcript
        setConversationHistory(prev => [
          ...prev,
          { role: 'user' as const, content: newAccumulated.trim() }
        ].slice(-20));
      }
    },
    onError: (error) => {
      console.error('[VoiceChat] Gemini error:', error);
      setIsConnecting(false); // Reset connecting state on any error
      toast({
        title: "Voice error",
        description: error,
        variant: "destructive",
      });
    },
    onConnected: () => {
      console.log('[VoiceChat] Connected to Gemini Live');
      setIsConnecting(false); // Connection established
      // Send initial greeting with context if provided from morning briefing
      const context = initialContextRef.current;
      if (context) {
        // Check if this is a morning briefing readout request
        try {
          const parsed = JSON.parse(context);
          if (parsed.type === 'morning_briefing_readout') {
            // Construct a detailed prompt for Flō to read out the briefing
            const prompt = `You are Flō, the user's personal health AI assistant. The user just tapped "Get your briefing from Flō" and wants you to READ OUT their personalized morning briefing, EXPLAIN the reasoning behind each insight and recommendation, and then ASK if they have any questions.

Here is their morning briefing data:
- Greeting: ${parsed.greeting}
- Readiness Score: ${parsed.readiness_score}/100
- Readiness Insight: ${parsed.readiness_insight}
- Sleep: ${parsed.sleep?.total_hours?.toFixed(1) || 'N/A'} hours total, ${parsed.sleep?.deep_sleep_minutes || 'N/A'} minutes deep sleep, quality rated "${parsed.sleep?.quality || 'unknown'}"${parsed.sleep?.hrv ? `, HRV ${parsed.sleep.hrv}ms` : ''}
- Sleep Insight: ${parsed.sleep_insight}
${parsed.weather ? `- Weather: ${parsed.weather}` : ''}
${parsed.recent_activity ? `- Recent Activity: ${parsed.recent_activity.type} (${parsed.recent_activity.when}) - ${parsed.recent_activity.impact}` : ''}
- Today's Recommendation: ${parsed.recommendation}

INSTRUCTIONS:
1. Start with a warm, personalized greeting using their briefing greeting
2. Read out their readiness score and explain what it means for their day
3. Summarize their sleep data and explain why the quality rating was given
4. If there's weather data, mention it briefly
5. Present the recommendation and EXPLAIN WHY you're recommending this based on their data
6. End by asking "Do you have any questions about your briefing, or would you like me to dive deeper into any of these insights?"

Be conversational, warm, and speak as if you're their knowledgeable health companion. Keep it concise but insightful.`;
            sendText(prompt);
          } else {
            sendText(`The user is coming from their morning briefing and wants to discuss it. Here is the context:\n\n${context}\n\nPlease greet them and provide actionable insights based on this data. Be specific about their metrics and what they mean.`);
          }
        } catch {
          // Fallback for non-JSON context
          sendText(`The user is coming from their morning briefing and wants to discuss it. Here is the context:\n\n${context}\n\nPlease greet them and provide actionable insights based on this data. Be specific about their metrics and what they mean.`);
        }
      } else {
        sendText("Hello! Please greet me and let me know you're ready to help with my health data.");
      }
      // Start listening for user speech
      startListening();
    },
    onDisconnected: () => {
      console.log('[VoiceChat] Disconnected from Gemini Live');
      setIsConnecting(false); // Reset connecting state on disconnect
    },
    onFloResponse: (text) => {
      // Add Flo's response as a message
      const floMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: text,
        timestamp: new Date(),
        isVoice: true,
      };
      setMessages(prev => [...prev, floMessage]);
      
      // Update conversation history
      setConversationHistory(prev => [
        ...prev,
        { role: 'assistant' as const, content: text }
      ].slice(-20));
    },
  });

  // isProcessing should only be true when actively trying to connect
  const isProcessing = isConnecting;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const startConversation = useCallback(async () => {
    console.log('[VoiceChat] Starting Gemini Live conversation...');
    setIsConnecting(true); // Set connecting state
    // Connect will call onError callback on failure (which resets isConnecting)
    // and onConnected on success (which also resets isConnecting)
    await connect();
  }, [connect]);

  const endConversation = useCallback(() => {
    console.log('[VoiceChat] Ending conversation...');
    setIsConnecting(false); // Clear any connecting state
    stopListening();
    disconnect();
  }, [stopListening, disconnect]);

  // Handle close button - ensure we disconnect first
  const handleClose = useCallback(() => {
    console.log('[VoiceChat] Closing chat window...');
    setIsConnecting(false); // Clear any connecting state
    disconnect();
    onClose();
  }, [disconnect, onClose]);

  const handleMicPress = useCallback(() => {
    if (isConnected) {
      // End conversation
      endConversation();
    } else {
      // Start conversation
      startConversation();
    }
  }, [isConnected, startConversation, endConversation]);

  const handleTextSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTextLoading) return;
    
    const userText = inputValue.trim();
    setInputValue('');
    setIsTextLoading(true);
    
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: userText,
      timestamp: new Date(),
      isVoice: false,
    };
    setMessages(prev => [...prev, userMessage]);
    
    try {
      // Use text chat API for text mode
      const response = await apiRequest('POST', '/api/flo-oracle/chat', {
        message: userText,
        conversationHistory,
      });
      
      const result = await response.json() as { response: string };
      
      // Add Flo response
      const floMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'flo',
        content: result.response,
        timestamp: new Date(),
        isVoice: false,
      };
      setMessages(prev => [...prev, floMessage]);
      
      // Update conversation history
      setConversationHistory(prev => [
        ...prev,
        { role: 'user' as const, content: userText },
        { role: 'assistant' as const, content: result.response }
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
        onClick={handleClose}
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
                Flō
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                  Powered by Flō AI
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isConnected && (
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
              onClick={handleClose}
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
                        Flō
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
          
          {/* Show current transcript while listening */}
          {currentTranscript && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end"
            >
              <div className={`max-w-[85%] px-4 py-3 rounded-2xl bg-gradient-to-r from-teal-500/50 via-cyan-500/50 to-blue-500/50 text-white/80`}>
                <p className="text-sm leading-relaxed italic">{currentTranscript}...</p>
              </div>
            </motion.div>
          )}
          
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
                    Connecting...
                  </span>
                </div>
              </div>
            </motion.div>
          )}
          
          {messages.length === 1 && !isConnected && (
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
                    isConnected
                      ? isListening
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
                  ) : isConnected ? (
                    <PhoneOff className="w-6 h-6 text-white" />
                  ) : (
                    <Phone className="w-7 h-7 text-white" />
                  )}
                  
                  {isListening && (
                    <>
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-red-400"
                        animate={{
                          scale: [1, 1.3, 1],
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
                          scale: [1, 1.5, 1],
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
                  
                  {isConnected && !isListening && !isSpeaking && !isProcessing && (
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
                  {isConnected
                    ? isListening 
                      ? 'Listening...' 
                      : isSpeaking
                        ? 'Flō is speaking...'
                        : 'Tap to end call'
                    : 'Tap to start call'
                  }
                </p>
                
                <p className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                  {isConnected
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

          {/* AI Provider Attribution */}
          <p className={`text-center text-[10px] mt-3 ${isDark ? 'text-white/20' : 'text-gray-300'}`}>
            Powered by Google AI · Your data is anonymized
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

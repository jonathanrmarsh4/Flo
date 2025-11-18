import { useState, useEffect, useRef } from 'react';
import { X, Send, Activity, Heart, Moon, TrendingUp, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FloLogo } from './FloLogo';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  type: 'user' | 'flo';
  content: string;
  timestamp: Date;
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
      content: "Hi there! I'm Flō Oracle, your personal health AI. Ask me anything about your health data.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Focus input when component mounts
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/flo-oracle/chat', {
        message: text.trim(),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from Flō Oracle');
      }

      const data = await response.json() as { response: string | { sanitizedOutput?: string } };

      // Handle both string response and object response (from guardrails)
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
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSuggestionClick = (text: string) => {
    sendMessage(text);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
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
        {/* Header */}
        <div className={`px-5 py-4 border-b ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <FloLogo size={32} />
                <motion.div
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500"
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
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Your personal health AI
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
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
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

          {isLoading && (
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
          
          {/* Quick suggestions - only show on first message */}
          {messages.length === 1 && (
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
                      disabled={isLoading}
                      className={`flex items-center gap-3 p-2.5 rounded-xl backdrop-blur-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        isDark
                          ? 'bg-white/5 hover:bg-white/10 border border-white/10'
                          : 'bg-white/60 hover:bg-white/80 border border-white/20'
                      }`}
                      data-testid={`suggestion-${index}`}
                    >
                      <div className={`p-2 rounded-lg bg-gradient-to-br ${suggestion.color}`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <span className={`text-sm flex-1 text-left ${
                        isDark ? 'text-white' : 'text-gray-900'
                      }`}>
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

        {/* Input */}
        <div className={`px-5 py-4 border-t ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
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
              disabled={!inputValue.trim() || isLoading}
              className={`p-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                inputValue.trim() && !isLoading
                  ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/25'
                  : isDark
                    ? 'bg-white/10'
                    : 'bg-white/70'
              }`}
              data-testid="button-send-message"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Send className={`w-5 h-5 ${
                  inputValue.trim() ? 'text-white' : isDark ? 'text-white/50' : 'text-gray-500'
                }`} />
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

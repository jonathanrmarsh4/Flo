import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, MicOff, Volume2, Sparkles, Activity, Heart, Moon, TrendingUp, Loader2 } from 'lucide-react';
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
      content: "Hi there! I'm Flō Oracle, your personal health AI. Tap the mic button to start our conversation.",
      timestamp: new Date(),
      isVoice: false,
    },
  ]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<{ data: Uint8Array; eventId: number }[]>([]);
  const isPlayingRef = useRef(false);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
    };
  }, []);

  const playAudioChunk = useCallback(async (audioData: Uint8Array, eventId: number) => {
    audioQueueRef.current.push({ data: audioData, eventId });
    if (!isPlayingRef.current) {
      processAudioQueue();
    }
  }, []);

  const processAudioQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const { data: audioData } = audioQueueRef.current.shift()!;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const pcmData = new Int16Array(audioData.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / (pcmData[i] < 0 ? 0x8000 : 0x7FFF);
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, floatData.length, 16000);
      audioBuffer.getChannelData(0).set(floatData);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      source.onended = () => {
        processAudioQueue();
      };

      source.start();
    } catch (error) {
      console.error('[ElevenLabs] Error playing audio:', error);
      processAudioQueue();
    }
  }, []);

  const sendWebSocketMessage = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connectToElevenLabs = useCallback(async () => {
    try {
      setConnectionStatus('connecting');
      console.log('[ElevenLabs] Requesting signed URL...');

      const response = await apiRequest('POST', '/api/elevenlabs/get-signed-url', {});
      const data = await response.json() as { signed_url: string; user_id: string };

      console.log('[ElevenLabs] Connecting to WebSocket...');

      const ws = new WebSocket(data.signed_url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ElevenLabs] WebSocket connected');
        setConnectionStatus('connected');
        
        sendWebSocketMessage({
          type: 'conversation_initiation_client_data',
        });
        
        toast({
          title: "Connected to Flō Oracle",
          description: "Voice assistant is ready. Start speaking!",
        });
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[ElevenLabs] Received message:', data.type);

          switch (data.type) {
            case 'ping':
              setTimeout(() => {
                sendWebSocketMessage({
                  type: 'pong',
                  event_id: data.ping_event.event_id,
                });
              }, data.ping_event.ping_ms || 0);
              break;

            case 'audio':
              if (data.audio_event?.audio_base_64) {
                const audioBytes = Uint8Array.from(atob(data.audio_event.audio_base_64), c => c.charCodeAt(0));
                await playAudioChunk(audioBytes, data.audio_event.event_id);
              }
              break;

            case 'interruption':
              console.log('[ElevenLabs] User interrupted');
              audioQueueRef.current = [];
              if (audioContextRef.current) {
                await audioContextRef.current.close();
                audioContextRef.current = new AudioContext();
              }
              setIsSpeaking(false);
              break;

            case 'agent_response':
              console.log('[ElevenLabs] Agent response:', data.agent_response_event.agent_response);
              const floMessage: Message = {
                id: Date.now().toString(),
                type: 'flo',
                content: data.agent_response_event.agent_response,
                timestamp: new Date(),
                isVoice: true,
              };
              setMessages((prev) => [...prev, floMessage]);
              break;

            case 'user_transcript':
              console.log('[ElevenLabs] User transcript:', data.user_transcription_event.user_transcript);
              const userMessage: Message = {
                id: Date.now().toString(),
                type: 'user',
                content: data.user_transcription_event.user_transcript,
                timestamp: new Date(),
                isVoice: true,
              };
              setMessages((prev) => [...prev, userMessage]);
              break;

            case 'agent_response_correction':
              console.log('[ElevenLabs] Agent response correction');
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastFloIndex = newMessages.findLastIndex(m => m.type === 'flo');
                if (lastFloIndex !== -1) {
                  newMessages[lastFloIndex] = {
                    ...newMessages[lastFloIndex],
                    content: data.agent_response_correction_event.corrected_agent_response,
                  };
                }
                return newMessages;
              });
              break;
          }
        } catch (error) {
          console.error('[ElevenLabs] Error processing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[ElevenLabs] WebSocket error:', error);
        toast({
          title: "Connection error",
          description: "Failed to connect to voice assistant. Please try again.",
          variant: "destructive",
        });
        setConnectionStatus('disconnected');
      };

      ws.onclose = () => {
        console.log('[ElevenLabs] WebSocket closed');
        setConnectionStatus('disconnected');
        setIsRecording(false);
      };

    } catch (error: any) {
      console.error('[ElevenLabs] Connection error:', error);
      toast({
        title: "Connection failed",
        description: error.message || "Could not connect to voice assistant.",
        variant: "destructive",
      });
      setConnectionStatus('disconnected');
    }
  }, [sendWebSocketMessage, playAudioChunk, toast]);

  const startRecording = useCallback(async () => {
    try {
      if (connectionStatus !== 'connected') {
        await connectToElevenLabs();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      mediaStreamRef.current = stream;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = event.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(inputData.length);
          
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(pcmData.buffer))));
          
          sendWebSocketMessage({
            user_audio_chunk: base64Audio,
          });
        }
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      setIsRecording(true);
      console.log('[ElevenLabs] Recording started');

    } catch (error: any) {
      console.error('[ElevenLabs] Error starting recording:', error);
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Microphone access denied",
          description: "Please allow microphone access in your browser settings.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Recording error",
          description: "Could not start recording. Please try again.",
          variant: "destructive",
        });
      }
    }
  }, [connectionStatus, connectToElevenLabs, sendWebSocketMessage, toast]);

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
    console.log('[ElevenLabs] Recording stopped');
  }, []);

  const handleRecordToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleSuggestionClick = (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date(),
      isVoice: false,
    };
    setMessages((prev) => [...prev, userMessage]);
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
                    connectionStatus === 'connected' 
                      ? isSpeaking ? 'bg-cyan-500' : 'bg-green-500'
                      : connectionStatus === 'connecting' 
                        ? 'bg-yellow-500' 
                        : 'bg-gray-400'
                  }`}
                  animate={{
                    scale: connectionStatus === 'connected' ? [1, 1.2, 1] : 1,
                    opacity: connectionStatus === 'connected' ? [1, 0.7, 1] : 0.5,
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
                  Flō Oracle
                </h1>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  {connectionStatus === 'connecting' 
                    ? 'Connecting...' 
                    : connectionStatus === 'connected'
                      ? isSpeaking ? 'Speaking...' : isRecording ? 'Listening...' : 'Connected'
                      : 'Tap mic to connect'}
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

          {isSpeaking && (
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
          
          {messages.length === 1 && connectionStatus === 'disconnected' && (
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
              disabled={isSpeaking || connectionStatus === 'connecting'}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl ${
                isSpeaking || connectionStatus === 'connecting'
                  ? 'bg-gray-400 cursor-not-allowed'
                  : isRecording
                    ? 'bg-red-500 shadow-red-500/50'
                    : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 shadow-cyan-500/50'
              }`}
              data-testid="button-voice-toggle"
            >
              {connectionStatus === 'connecting' ? (
                <Loader2 className="w-7 h-7 text-white animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-7 h-7 text-white" />
              ) : (
                <Mic className="w-7 h-7 text-white" />
              )}
              
              {!isRecording && !isSpeaking && connectionStatus !== 'connecting' && (
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
                {isSpeaking 
                  ? 'Flō is speaking' 
                  : connectionStatus === 'connecting' 
                    ? 'Connecting...' 
                    : isRecording 
                      ? 'Tap to stop' 
                      : 'Tap to speak'}
              </p>
              <p className={`text-xs mt-0.5 flex items-center justify-center gap-1 ${
                isDark ? 'text-white/40' : 'text-gray-400'
              }`}>
                <Sparkles className="w-3 h-3" />
                ElevenLabs + Grok powered
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

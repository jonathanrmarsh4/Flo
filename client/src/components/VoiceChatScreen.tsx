import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, MicOff, Volume2, Sparkles, Activity, Heart, Moon, TrendingUp, Loader2, Send, PhoneOff } from 'lucide-react';
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

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
type VoiceState = 'idle' | 'listening' | 'speaking';

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
      content: "Hi there! I'm Flō Oracle, your personal health AI. Start talking and I'll respond naturally.",
      timestamp: new Date(),
      isVoice: false,
    },
  ]);
  
  // Voice state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  
  // Text fallback state
  const [inputValue, setInputValue] = useState('');
  const [isTextLoading, setIsTextLoading] = useState(false);
  
  // Transcript accumulator for brain updates
  const currentUserTranscript = useRef('');
  const currentAssistantTranscript = useRef('');
  
  // Refs for WebRTC
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const { toast } = useToast();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectVoice();
    };
  }, []);

  // Audio level monitoring
  const startAudioLevelMonitoring = useCallback((stream: MediaStream) => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const updateLevel = () => {
      if (analyserRef.current && voiceState === 'listening') {
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(Math.min(100, average * 1.5));
      }
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
  }, [voiceState]);

  // Send brain update to backend (async, fire-and-forget)
  const sendBrainUpdate = useCallback(async (userMessage?: string, assistantMessage?: string) => {
    if (!userMessage && !assistantMessage) return;
    
    try {
      await apiRequest('POST', '/api/voice/brain-update', {
        userMessage,
        assistantMessage
      });
      console.log('[VoiceChat] Brain update sent');
    } catch (error) {
      console.error('[VoiceChat] Brain update failed:', error);
    }
  }, []);

  // Handle data channel messages from OpenAI
  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[VoiceChat] Received event:', data.type);
      
      switch (data.type) {
        case 'session.created':
          console.log('[VoiceChat] Session created, ready for conversation');
          setVoiceState('listening');
          break;
          
        case 'input_audio_buffer.speech_started':
          console.log('[VoiceChat] Speech started');
          setVoiceState('listening');
          break;
          
        case 'input_audio_buffer.speech_stopped':
          console.log('[VoiceChat] Speech stopped');
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          // User's speech transcription
          const userTranscript = data.transcript?.trim();
          if (userTranscript) {
            console.log('[VoiceChat] User said:', userTranscript);
            currentUserTranscript.current = userTranscript;
            
            const userMessage: Message = {
              id: Date.now().toString(),
              type: 'user',
              content: userTranscript,
              timestamp: new Date(),
              isVoice: true,
            };
            setMessages((prev) => [...prev, userMessage]);
          }
          break;
          
        case 'response.audio_transcript.delta':
          // Streaming assistant transcript
          if (data.delta) {
            currentAssistantTranscript.current += data.delta;
          }
          break;
          
        case 'response.audio_transcript.done':
          // Full assistant transcript complete
          const assistantTranscript = data.transcript?.trim() || currentAssistantTranscript.current.trim();
          if (assistantTranscript) {
            console.log('[VoiceChat] Flo said:', assistantTranscript);
            
            const floMessage: Message = {
              id: (Date.now() + 1).toString(),
              type: 'flo',
              content: assistantTranscript,
              timestamp: new Date(),
              isVoice: true,
            };
            setMessages((prev) => [...prev, floMessage]);
            
            // Send brain update with both messages
            sendBrainUpdate(currentUserTranscript.current, assistantTranscript);
            
            // Reset accumulators
            currentUserTranscript.current = '';
            currentAssistantTranscript.current = '';
          }
          break;
          
        case 'response.audio.started':
        case 'response.created':
          setVoiceState('speaking');
          break;
          
        case 'response.audio.done':
        case 'response.done':
          setVoiceState('listening');
          break;
          
        case 'error':
          console.error('[VoiceChat] Error from OpenAI:', data.error);
          toast({
            title: "Voice error",
            description: data.error?.message || "An error occurred during the conversation.",
            variant: "destructive",
          });
          break;
      }
    } catch (error) {
      console.error('[VoiceChat] Error parsing message:', error);
    }
  }, [sendBrainUpdate, toast]);

  // Connect to OpenAI Realtime via WebRTC
  const connectVoice = useCallback(async () => {
    try {
      setConnectionState('connecting');
      
      // Get ephemeral token from our backend
      const tokenResponse = await apiRequest('POST', '/api/openai-realtime/token');
      const tokenData = await tokenResponse.json() as { client_secret: string; error?: string };
      
      console.log('[VoiceChat] Token response parsed:', { hasSecret: !!tokenData.client_secret });
      
      if (tokenData.error) {
        throw new Error(tokenData.error);
      }
      
      const { client_secret } = tokenData;
      if (!client_secret) {
        throw new Error('No client secret received');
      }
      console.log('[VoiceChat] Got ephemeral token');
      
      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;
      
      // Set up audio element for playback
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElementRef.current = audioEl;
      
      // Handle incoming audio track
      pc.ontrack = (event) => {
        console.log('[VoiceChat] Received audio track');
        audioEl.srcObject = event.streams[0];
      };
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      localStreamRef.current = stream;
      
      // Add microphone track to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
      
      // Start audio level monitoring
      startAudioLevelMonitoring(stream);
      
      // Create data channel for events
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;
      
      dc.onopen = () => {
        console.log('[VoiceChat] Data channel opened');
      };
      
      dc.onmessage = handleDataChannelMessage;
      
      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // Wait for ICE gathering
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') {
              resolve();
            }
          };
        }
      });
      
      // Send offer to OpenAI
      console.log('[VoiceChat] Sending SDP offer to OpenAI...');
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp'
        },
        body: pc.localDescription?.sdp
      });
      
      console.log('[VoiceChat] OpenAI response status:', sdpResponse.status);
      
      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        console.error('[VoiceChat] OpenAI error response:', errorText);
        throw new Error(`OpenAI Realtime connection failed: ${sdpResponse.status} - ${errorText}`);
      }
      
      // Set remote description
      const answerSdp = await sdpResponse.text();
      console.log('[VoiceChat] Received SDP answer, setting remote description...');
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      });
      
      console.log('[VoiceChat] WebRTC connection established');
      setConnectionState('connected');
      setVoiceState('listening');
      
      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('[VoiceChat] Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setConnectionState('error');
          setVoiceState('idle');
        }
      };
      
    } catch (error: any) {
      // Log detailed error info for debugging (some errors have non-enumerable properties)
      console.error('[VoiceChat] Connection error:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        code: error?.code,
        toString: String(error)
      });
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
      }
    }
  }, [handleDataChannelMessage, startAudioLevelMonitoring, toast]);

  // Disconnect voice
  const disconnectVoice = useCallback(() => {
    console.log('[VoiceChat] Disconnecting...');
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Close data channel
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    // Clear audio element
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }
    
    setConnectionState('disconnected');
    setVoiceState('idle');
    setAudioLevel(0);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Handle voice toggle button
  const handleVoiceToggle = useCallback(() => {
    if (connectionState === 'disconnected' || connectionState === 'error') {
      connectVoice();
    } else if (connectionState === 'connected') {
      toggleMute();
    }
  }, [connectionState, connectVoice, toggleMute]);

  // Handle end call
  const handleEndCall = useCallback(() => {
    disconnectVoice();
  }, [disconnectVoice]);

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
        history: messages.slice(1).map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
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
    if (isVoiceMode && connectionState === 'connected' && dataChannelRef.current) {
      // Send as text input to OpenAI Realtime
      dataChannelRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }]
        }
      }));
      dataChannelRef.current.send(JSON.stringify({
        type: 'response.create'
      }));
      
      // Add to UI
      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: text,
        timestamp: new Date(),
        isVoice: false,
      };
      setMessages((prev) => [...prev, userMessage]);
    } else {
      setInputValue(text);
      inputRef.current?.focus();
    }
  };

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const isListening = voiceState === 'listening' && isConnected;
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
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Liquid Glass Window */}
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
        {/* Header */}
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
                <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                  {isConnected ? '🟢 Connected' : isConnecting ? '🟡 Connecting...' : '⚪ Ready'}
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

        {/* Listening Indicator */}
        {isListening && !isMuted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            <div className={`rounded-2xl px-4 py-2 backdrop-blur-xl ${
              isDark ? 'bg-white/5 border border-white/10' : 'bg-white/60 border border-white/20'
            }`}>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 h-4">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      className={`w-1 rounded-full ${isDark ? 'bg-cyan-400' : 'bg-cyan-600'}`}
                      animate={{
                        height: [4, Math.min(16, 4 + (audioLevel * 0.15)), 4],
                      }}
                      transition={{
                        duration: 0.3,
                        repeat: Infinity,
                        delay: i * 0.05,
                      }}
                    />
                  ))}
                </div>
                <span className={`text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                  Listening...
                </span>
              </div>
            </div>
          </motion.div>
        )}

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
        {messages.length === 1 && !isSpeaking && !isListening && (
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
            {/* Voice Control Buttons */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-4">
                {/* End Call Button (only when connected) */}
                {isConnected && (
                  <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleEndCall}
                    className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg"
                    data-testid="button-end-call"
                  >
                    <PhoneOff className="w-5 h-5 text-white" />
                  </motion.button>
                )}

                {/* Main Mic Button */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleVoiceToggle}
                  disabled={isConnecting}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl disabled:opacity-70 ${
                    isConnecting
                      ? 'bg-gray-400 cursor-wait'
                      : isConnected && isMuted
                        ? 'bg-orange-500 shadow-orange-500/50'
                        : isConnected
                          ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 shadow-cyan-500/50'
                          : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 shadow-cyan-500/50'
                  }`}
                  data-testid="button-voice-toggle"
                >
                  {isConnecting ? (
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                  ) : isMuted ? (
                    <MicOff className="w-7 h-7 text-white" />
                  ) : (
                    <Mic className="w-7 h-7 text-white" />
                  )}
                  
                  {/* Pulsing rings when listening */}
                  {isListening && !isMuted && (
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
                </motion.button>
              </div>

              <div className="text-center">
                <p className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {isConnecting 
                    ? 'Connecting...' 
                    : isConnected && isMuted 
                      ? 'Muted - tap to unmute'
                      : isConnected
                        ? isSpeaking 
                          ? 'Flō is speaking'
                          : 'Just start talking'
                        : 'Tap to start conversation'
                  }
                </p>
                <p className={`text-xs mt-0.5 flex items-center justify-center gap-1 ${
                  isDark ? 'text-white/40' : 'text-gray-400'
                }`}>
                  <Sparkles className="w-3 h-3" />
                  Natural voice conversation
                </p>
              </div>

              {/* Switch to text mode */}
              <button
                onClick={() => {
                  disconnectVoice();
                  setIsVoiceMode(false);
                }}
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

import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, MessageSquare, Zap, XCircle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGrokVoice } from '@/hooks/useGrokVoice';
import { useToast } from '@/hooks/use-toast';

type GrokVoiceName = 'Ara' | 'Eve' | 'Leo' | 'Sal' | 'Rex' | 'Mika' | 'Valentin';

const GROK_VOICES: { value: GrokVoiceName; label: string; description: string }[] = [
  { value: 'Ara', label: 'Ara', description: 'Confident & clear' },
  { value: 'Eve', label: 'Eve', description: 'Warm & friendly' },
  { value: 'Leo', label: 'Leo', description: 'Energetic & engaging' },
  { value: 'Sal', label: 'Sal', description: 'Calm & professional' },
  { value: 'Rex', label: 'Rex', description: 'Bold & direct' },
  { value: 'Mika', label: 'Mika', description: 'Bright & cheerful' },
  { value: 'Valentin', label: 'Valentin', description: 'Sophisticated & smooth' },
];

interface TranscriptEntry {
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export function AdminGrokSandbox() {
  const { toast } = useToast();
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<GrokVoiceName>('Valentin');
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [transcript, scrollToBottom]);

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    setCurrentUserText(text);
    if (isFinal && text.trim()) {
      setTranscript(prev => [...prev, { role: 'user', text, timestamp: new Date() }]);
      setCurrentUserText('');
    }
  }, []);

  const handleGrokResponse = useCallback((text: string) => {
    setAiResponseText(prev => prev + text);
  }, []);

  const handleConnected = useCallback(() => {
    toast({
      title: 'Grok Voice Connected',
      description: 'xAI Grok Voice Agent session started',
    });
    setTranscript([]);
    setAiResponseText('');
  }, [toast]);

  const handleDisconnected = useCallback(() => {
    if (aiResponseText.trim()) {
      setTranscript(prev => [...prev, { role: 'ai', text: aiResponseText.trim(), timestamp: new Date() }]);
      setAiResponseText('');
    }
    toast({
      title: 'Grok Disconnected',
      description: 'Voice session ended',
    });
  }, [toast, aiResponseText]);

  const handleError = useCallback((error: string) => {
    toast({
      title: 'Grok Error',
      description: error,
      variant: 'destructive',
    });
  }, [toast]);

  const {
    isConnected,
    isListening,
    isSpeaking,
    error,
    connect,
    disconnect,
    startListening,
    stopListening,
  } = useGrokVoice({
    voiceName: selectedVoice,
    onTranscript: handleTranscript,
    onGrokResponse: handleGrokResponse,
    onConnected: handleConnected,
    onDisconnected: handleDisconnected,
    onError: handleError,
  });

  useEffect(() => {
    if (!isSpeaking && aiResponseText.trim()) {
      setTranscript(prev => [...prev, { role: 'ai', text: aiResponseText.trim(), timestamp: new Date() }]);
      setAiResponseText('');
    }
  }, [isSpeaking, aiResponseText]);

  const handleToggleConnection = async () => {
    if (isConnected) {
      disconnect();
    } else {
      await connect();
    }
  };

  const handleToggleListening = async () => {
    if (isListening) {
      stopListening();
    } else {
      await startListening();
    }
  };

  return (
    <div className="rounded-2xl border bg-white/5 border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg text-cyan-400">Grok Voice Agent (xAI)</h3>
        </div>
        <p className="text-sm text-white/60">
          Test xAI's Grok Voice Agent API. Sub-1s latency, with full health data access.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-white/60" />
            <Select
              value={selectedVoice}
              onValueChange={(value) => setSelectedVoice(value as GrokVoiceName)}
              disabled={isConnected}
            >
              <SelectTrigger className="w-[180px] bg-white/5 border-white/20 text-white" data-testid="select-grok-voice">
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                {GROK_VOICES.map((voice) => (
                  <SelectItem key={voice.value} value={voice.value}>
                    <div className="flex flex-col">
                      <span>{voice.label}</span>
                      <span className="text-xs text-muted-foreground">{voice.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleToggleConnection}
            variant={isConnected ? 'destructive' : 'default'}
            className={isConnected ? '' : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'}
            data-testid="button-grok-connection"
          >
            {isConnected ? (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                End Session
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Start Grok
              </>
            )}
          </Button>

          {isConnected && (
            <Button
              onClick={handleToggleListening}
              variant={isListening ? 'secondary' : 'outline'}
              className={isListening ? 'bg-red-500/20 text-red-400 border-red-500/50' : ''}
              data-testid="button-grok-mic"
            >
              {isListening ? (
                <>
                  <MicOff className="w-4 h-4 mr-2" />
                  Stop Mic
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 mr-2" />
                  Start Mic
                </>
              )}
            </Button>
          )}

          {isConnected && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
              {isSpeaking ? (
                <>
                  <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span className="text-sm text-cyan-400">Grok Speaking...</span>
                </>
              ) : isListening ? (
                <>
                  <Mic className="w-4 h-4 text-blue-400 animate-pulse" />
                  <span className="text-sm text-blue-400">Listening...</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 text-white/40" />
                  <span className="text-sm text-white/40">Idle</span>
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {isConnected && (
          <div className="rounded-lg border border-white/10 bg-black/20">
            <div className="p-2 border-b border-white/10 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-white/70">Conversation</span>
            </div>
            <ScrollArea className="h-[300px] p-4" ref={scrollRef}>
              <div className="space-y-3">
                {transcript.map((entry, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${
                      entry.role === 'user'
                        ? 'bg-blue-500/20 border border-blue-500/30 ml-8'
                        : 'bg-cyan-500/20 border border-cyan-500/30 mr-8'
                    }`}
                    data-testid={`grok-transcript-${entry.role}-${index}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${entry.role === 'user' ? 'text-blue-400' : 'text-cyan-400'}`}>
                        {entry.role === 'user' ? 'You' : 'Grok'}
                      </span>
                      <span className="text-xs text-white/40">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-white/90">{entry.text}</p>
                  </div>
                ))}

                {currentUserText && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 ml-8 animate-pulse">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-blue-400">You (speaking...)</span>
                    </div>
                    <p className="text-sm text-white/70 italic">{currentUserText}</p>
                  </div>
                )}

                {aiResponseText && (
                  <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mr-8">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-cyan-400">Grok (responding...)</span>
                    </div>
                    <p className="text-sm text-white/70">{aiResponseText}</p>
                  </div>
                )}

                {transcript.length === 0 && !currentUserText && !aiResponseText && (
                  <div className="text-center py-8 text-white/40 text-sm">
                    Start speaking to test Grok Voice Agent...
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-white/50">
            <strong className="text-cyan-400">xAI Grok Voice:</strong> Testing xAI's Voice Agent API 
            with sub-second latency, full health data context, and built-in web search. 
            Voice: {selectedVoice} ({GROK_VOICES.find(v => v.value === selectedVoice)?.description}).
            Pricing: $0.05/min.
          </p>
        </div>
      </div>
    </div>
  );
}

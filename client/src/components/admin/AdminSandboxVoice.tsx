import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, MessageSquare, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGeminiLiveVoice } from '@/hooks/useGeminiLiveVoice';
import { useToast } from '@/hooks/use-toast';

interface TranscriptEntry {
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export function AdminSandboxVoice() {
  const { toast } = useToast();
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
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

  const handleFloResponse = useCallback((text: string) => {
    setAiResponseText(prev => prev + text);
  }, []);

  const handleConnected = useCallback(() => {
    toast({
      title: 'Sandbox Connected',
      description: 'AI Sandbox voice session started with unrestricted prompts',
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
      title: 'Sandbox Disconnected',
      description: 'Voice session ended',
    });
  }, [toast, aiResponseText]);

  const handleError = useCallback((error: string) => {
    toast({
      title: 'Sandbox Error',
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
  } = useGeminiLiveVoice({
    endpoint: 'admin-sandbox',
    onTranscript: handleTranscript,
    onFloResponse: handleFloResponse,
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
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-orange-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-400">
          <Sparkles className="w-5 h-5" />
          AI Sandbox Voice
        </CardTitle>
        <CardDescription className="text-amber-200/60">
          Unrestricted AI with full health data access. Uses female voice (Kore) and saves to brain memory.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleToggleConnection}
            variant={isConnected ? 'destructive' : 'default'}
            className={isConnected ? '' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'}
            data-testid="button-sandbox-connection"
          >
            {isConnected ? (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                End Session
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Start Sandbox
              </>
            )}
          </Button>

          {isConnected && (
            <Button
              onClick={handleToggleListening}
              variant={isListening ? 'secondary' : 'outline'}
              className={isListening ? 'bg-red-500/20 text-red-400 border-red-500/50' : ''}
              data-testid="button-sandbox-mic"
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
                  <Volume2 className="w-4 h-4 text-green-400 animate-pulse" />
                  <span className="text-sm text-green-400">AI Speaking...</span>
                </>
              ) : isListening ? (
                <>
                  <Mic className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="text-sm text-amber-400">Listening...</span>
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
              <MessageSquare className="w-4 h-4 text-amber-400" />
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
                        : 'bg-amber-500/20 border border-amber-500/30 mr-8'
                    }`}
                    data-testid={`transcript-${entry.role}-${index}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${entry.role === 'user' ? 'text-blue-400' : 'text-amber-400'}`}>
                        {entry.role === 'user' ? 'You' : 'AI Sandbox'}
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
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mr-8">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-amber-400">AI Sandbox (responding...)</span>
                    </div>
                    <p className="text-sm text-white/70">{aiResponseText}</p>
                  </div>
                )}

                {transcript.length === 0 && !currentUserText && !aiResponseText && (
                  <div className="text-center py-8 text-white/40 text-sm">
                    Start speaking to begin the conversation...
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-white/50">
            <strong className="text-amber-400">Admin Only:</strong> This sandbox uses an unrestricted AI prompt 
            with full access to your health data. Conversations ARE persisted to brain memory.
            Voice: Kore (female, confident)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

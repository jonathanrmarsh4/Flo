import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Play, Pause, Database, Volume2, Loader2, ChevronDown, ChevronUp, Download, AlertCircle, Mic, MicOff, MessageSquare, XCircle, Save, History, Trash2, Clock, Calendar } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGeminiLiveVoice } from '@/hooks/useGeminiLiveVoice';
import { format, formatDistanceToNow } from 'date-fns';

interface SIEResponse {
  text: string;
  audioBase64?: string;
  audioContentType?: string;
  sessionId: string;
  dataSourcesDiscovered: number;
  processingTimeMs: number;
}

interface TranscriptEntry {
  role: 'user' | 'sie';
  text: string;
  timestamp: Date;
}

interface SavedSession {
  id: string;
  title: string;
  transcript: TranscriptEntry[];
  hasAudio: boolean;
  durationSeconds: number | null;
  createdAt: string;
}

export function AdminSIE() {
  const { toast } = useToast();
  const [generateAudio, setGenerateAudio] = useState(true);
  const [response, setResponse] = useState<SIEResponse | null>(null);
  const [showFullResponse, setShowFullResponse] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  
  const [showBrainstorm, setShowBrainstorm] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [sieResponseText, setSieResponseText] = useState('');
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  
  const [showHistory, setShowHistory] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  
  const { data: sessionsResponse, refetch: refetchSessions } = useQuery<{ sessions: SavedSession[] }>({
    queryKey: ['/api/sandbox/sie/brainstorm-sessions'],
  });
  const savedSessions = sessionsResponse?.sessions || [];
  
  const saveSessionMutation = useMutation({
    mutationFn: async (data: { transcript: TranscriptEntry[], durationSeconds: number }) => {
      const title = `SIE Brainstorm - ${format(new Date(), 'MMM d, yyyy h:mm a')}`;
      const res = await apiRequest('POST', '/api/sandbox/sie/brainstorm-sessions', {
        title,
        transcript: data.transcript.map(t => ({
          role: t.role,
          text: t.text,
          timestamp: t.timestamp.toISOString(),
        })),
        durationSeconds: data.durationSeconds,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Session Saved',
        description: 'Voice brainstorm session saved successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sandbox/sie/brainstorm-sessions'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to Save Session',
        description: err.message || 'Could not save the session',
        variant: 'destructive',
      });
    },
  });
  
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest('DELETE', `/api/sandbox/sie/brainstorm-sessions/${sessionId}`);
    },
    onSuccess: () => {
      toast({
        title: 'Session Deleted',
        description: 'Voice brainstorm session deleted',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sandbox/sie/brainstorm-sessions'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to Delete Session',
        description: err.message || 'Could not delete the session',
        variant: 'destructive',
      });
    },
  });

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    setCurrentUserText(text);
    if (isFinal && text.trim()) {
      setTranscript(prev => [...prev, { role: 'user', text: text.trim(), timestamp: new Date() }]);
      setCurrentUserText('');
    }
  }, []);

  const handleSieResponse = useCallback((text: string) => {
    setSieResponseText(prev => prev + text);
  }, []);

  const handleVoiceError = useCallback((error: string) => {
    toast({
      title: 'Voice Error',
      description: error,
      variant: 'destructive',
    });
  }, [toast]);

  const handleConnected = useCallback(() => {
    setSessionStartTime(new Date());
    toast({
      title: 'Voice Brainstorm Connected',
      description: 'SIE is ready to brainstorm with you',
    });
  }, [toast]);

  const handleDisconnected = useCallback(() => {
    if (sieResponseText.trim()) {
      setTranscript(prev => [...prev, { role: 'sie', text: sieResponseText.trim(), timestamp: new Date() }]);
      setSieResponseText('');
    }
  }, [sieResponseText]);

  const {
    isConnected,
    isListening,
    isSpeaking,
    error: voiceError,
    connect,
    disconnect,
    startListening,
    stopListening,
  } = useGeminiLiveVoice({
    endpoint: 'sie-brainstorm',
    onTranscript: handleTranscript,
    onFloResponse: handleSieResponse,
    onError: handleVoiceError,
    onConnected: handleConnected,
    onDisconnected: handleDisconnected,
  });

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcript, currentUserText, sieResponseText]);

  useEffect(() => {
    if (!isSpeaking && sieResponseText.trim()) {
      setTranscript(prev => [...prev, { role: 'sie', text: sieResponseText.trim(), timestamp: new Date() }]);
      setSieResponseText('');
    }
  }, [isSpeaking, sieResponseText]);

  const handleToggleConnection = async () => {
    if (isConnected) {
      disconnect();
    } else {
      setTranscript([]);
      await connect();
      await startListening();
    }
  };
  
  const handleSaveSession = () => {
    if (transcript.length === 0) {
      toast({
        title: 'Nothing to Save',
        description: 'Start a voice brainstorm session first',
        variant: 'destructive',
      });
      return;
    }
    
    const durationSeconds = sessionStartTime 
      ? Math.round((Date.now() - sessionStartTime.getTime()) / 1000)
      : 0;
    
    saveSessionMutation.mutate({
      transcript,
      durationSeconds,
    });
  };
  
  const handleLoadSession = (session: SavedSession) => {
    setTranscript(session.transcript.map(t => ({
      ...t,
      timestamp: new Date(t.timestamp),
    })));
    setShowHistory(false);
    toast({
      title: 'Session Loaded',
      description: `Loaded session from ${format(new Date(session.createdAt), 'MMM d, yyyy')}`,
    });
  };
  
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'Unknown duration';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };
  
  const handleDownloadAudio = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sandbox/sie/brainstorm-sessions/${sessionId}/audio`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download audio');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sie-session-${sessionId}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Audio Downloaded',
        description: 'Session audio saved to your device',
      });
    } catch (err: any) {
      toast({
        title: 'Download Failed',
        description: err.message || 'Could not download audio',
        variant: 'destructive',
      });
    }
  };
  
  const handleDownloadTranscript = (session: SavedSession) => {
    const transcriptText = session.transcript.map(t => 
      `[${t.role.toUpperCase()}] ${t.text}`
    ).join('\n\n');
    
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sie-transcript-${session.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Transcript Downloaded',
      description: 'Session transcript saved to your device',
    });
  };

  const handleToggleMic = async () => {
    if (isListening) {
      stopListening();
    } else {
      await startListening();
    }
  };

  const runSIEMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const res = await apiRequest('POST', '/api/sandbox/sie', { generateAudio });
      return await res.json() as SIEResponse;
    },
    onSuccess: (data) => {
      setResponse(data);
      setShowBrainstorm(true);
      toast({
        title: 'SIE Analysis Complete',
        description: `Discovered ${data.dataSourcesDiscovered} data sources in ${(data.processingTimeMs / 1000).toFixed(1)}s`,
      });
      
      if (data.audioBase64 && generateAudio) {
        playAudio(data.audioBase64, data.audioContentType || 'audio/mpeg');
      }
    },
    onError: (err: any) => {
      const errorMessage = err.message || 'An error occurred';
      setError(errorMessage);
      toast({
        title: 'SIE Analysis Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  const playAudio = (base64Audio: string, contentType: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      const audioData = atob(base64Audio);
      const audioArray = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioArray[i] = audioData.charCodeAt(i);
      }
      
      const blob = new Blob([audioArray], { type: contentType });
      const audioUrl = URL.createObjectURL(blob);
      audioUrlRef.current = audioUrl;
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => setIsPlayingAudio(false);
      audio.onplay = () => setIsPlayingAudio(true);
      audio.onpause = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        setIsPlayingAudio(false);
        toast({
          title: 'Audio Playback Error',
          description: 'Could not play the generated audio',
          variant: 'destructive',
        });
      };
      
      audio.play();
    } catch (err) {
      console.error('Failed to play audio:', err);
      toast({
        title: 'Audio Playback Failed',
        description: 'Could not play the generated audio',
        variant: 'destructive',
      });
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlayingAudio) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    } else if (response?.audioBase64) {
      playAudio(response.audioBase64, response.audioContentType || 'audio/mpeg');
    }
  };

  const downloadAudio = () => {
    if (!response?.audioBase64) return;
    
    try {
      const audioData = atob(response.audioBase64);
      const audioArray = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioArray[i] = audioData.charCodeAt(i);
      }
      
      const blob = new Blob([audioArray], { type: response.audioContentType || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `sie_analysis_${response.sessionId}.mp3`;
      a.click();
      
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download audio:', err);
      toast({
        title: 'Download Failed',
        description: 'Could not download the audio file',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="rounded-2xl border bg-white/5 border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg text-white">Self-Improvement Engine (SIE)</h3>
        </div>
        <p className="text-sm text-white/60">
          Unrestricted AI analysis of Flō's data landscape. Run an analysis, then brainstorm and prioritize together.
        </p>
      </div>
      
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between p-4 rounded-xl border bg-white/5 border-white/10">
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5 text-purple-400" />
            <div>
              <Label htmlFor="audio-toggle" className="text-sm text-white">Generate Audio Response</Label>
              <p className="text-xs text-white/50">SIE will speak its recommendations aloud</p>
            </div>
          </div>
          <Switch
            id="audio-toggle"
            checked={generateAudio}
            onCheckedChange={setGenerateAudio}
            data-testid="switch-sie-audio"
          />
        </div>

        <Button
          onClick={() => runSIEMutation.mutate()}
          disabled={runSIEMutation.isPending}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          data-testid="button-run-sie"
        >
          {runSIEMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing Data Landscape...
            </>
          ) : (
            <>
              <Brain className="w-4 h-4 mr-2" />
              {response ? 'Run New Analysis' : 'Run SIE Analysis'}
            </>
          )}
        </Button>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20" data-testid="status-sie-error">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {response && (
          <div className="space-y-4" data-testid="container-sie-result">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20" data-testid="status-sie-success">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400" data-testid="text-sie-session">
                  Session: {response.sessionId}
                </span>
              </div>
              <span className="text-xs text-green-400/70" data-testid="text-sie-stats">
                {response.dataSourcesDiscovered} sources • {(response.processingTimeMs / 1000).toFixed(1)}s
              </span>
            </div>

            {response.audioBase64 ? (
              <div className="flex items-center gap-2" data-testid="container-sie-audio">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAudio}
                  className="flex-1"
                  data-testid="button-toggle-sie-audio"
                >
                  {isPlayingAudio ? (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause Audio
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Play Audio Response
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadAudio}
                  data-testid="button-download-sie-audio"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            ) : generateAudio ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20" data-testid="status-sie-audio-missing">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-yellow-400">Audio generation was requested but failed. Check server logs for details.</span>
              </div>
            ) : null}

            <div className="rounded-lg border bg-black/30 border-white/10 overflow-hidden">
              <button
                onClick={() => setShowFullResponse(!showFullResponse)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
                data-testid="button-toggle-sie-response"
              >
                <span className="text-sm text-white/70">Analysis Response</span>
                {showFullResponse ? (
                  <ChevronUp className="w-4 h-4 text-white/50" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white/50" />
                )}
              </button>
              
              {showFullResponse && (
                <ScrollArea className="h-96 p-4">
                  <pre className="text-xs text-white/80 whitespace-pre-wrap font-mono" data-testid="text-sie-response">
                    {response.text}
                  </pre>
                </ScrollArea>
              )}
            </div>

            <div className="rounded-lg border bg-black/30 border-white/10 overflow-hidden">
              <button
                onClick={() => setShowBrainstorm(!showBrainstorm)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
                data-testid="button-toggle-sie-brainstorm"
              >
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-white/70">Voice Brainstorm with SIE</span>
                  {isConnected && (
                    <span className="text-xs bg-green-500/30 px-2 py-0.5 rounded-full text-green-300">
                      Connected
                    </span>
                  )}
                  {transcript.length > 0 && (
                    <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded-full text-purple-300">
                      {transcript.length} exchanges
                    </span>
                  )}
                </div>
                {showBrainstorm ? (
                  <ChevronUp className="w-4 h-4 text-white/50" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white/50" />
                )}
              </button>
              
              {showBrainstorm && (
                <div className="border-t border-white/10">
                  <div className="p-4 border-b border-white/10">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={handleToggleConnection}
                        variant={isConnected ? 'destructive' : 'default'}
                        className={!isConnected ? 'bg-purple-500 hover:bg-purple-600' : ''}
                        data-testid="button-sie-voice-connect"
                      >
                        {isConnected ? (
                          <>
                            <XCircle className="w-4 h-4 mr-2" />
                            End Session
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4 mr-2" />
                            Start Voice Brainstorm
                          </>
                        )}
                      </Button>
                      
                      {isConnected && (
                        <Button
                          onClick={handleToggleMic}
                          variant={isListening ? 'secondary' : 'outline'}
                          data-testid="button-sie-voice-mic"
                        >
                          {isListening ? (
                            <>
                              <MicOff className="w-4 h-4 mr-2" />
                              Mute
                            </>
                          ) : (
                            <>
                              <Mic className="w-4 h-4 mr-2" />
                              Unmute
                            </>
                          )}
                        </Button>
                      )}
                      
                      {!isConnected && transcript.length > 0 && (
                        <Button
                          onClick={handleSaveSession}
                          variant="outline"
                          disabled={saveSessionMutation.isPending}
                          data-testid="button-sie-save-session"
                        >
                          {saveSessionMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save Session
                            </>
                          )}
                        </Button>
                      )}
                      
                      <Button
                        onClick={() => setShowHistory(!showHistory)}
                        variant="outline"
                        data-testid="button-sie-history"
                      >
                        <History className="w-4 h-4 mr-2" />
                        History ({savedSessions.length})
                      </Button>
                    </div>
                    
                    {isConnected && (
                      <div className="flex items-center gap-4 mt-3 text-xs text-white/50">
                        {isListening && (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            Listening...
                          </span>
                        )}
                        {isSpeaking && (
                          <span className="flex items-center gap-1">
                            <Volume2 className="w-3 h-3 text-purple-400" />
                            SIE Speaking...
                          </span>
                        )}
                      </div>
                    )}
                    
                    {voiceError && (
                      <div className="mt-3 text-sm text-red-400">{voiceError}</div>
                    )}
                  </div>
                  
                  <ScrollArea className="h-64 p-4" ref={transcriptScrollRef} data-testid="container-sie-voice-transcript">
                    <div className="space-y-3">
                      {transcript.map((entry, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg ${
                            entry.role === 'user'
                              ? 'bg-blue-500/10 border border-blue-500/20 ml-8'
                              : 'bg-purple-500/10 border border-purple-500/20 mr-8'
                          }`}
                          data-testid={`transcript-${entry.role}-${idx}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium ${entry.role === 'user' ? 'text-blue-400' : 'text-purple-400'}`}>
                              {entry.role === 'user' ? 'You' : 'SIE'}
                            </span>
                          </div>
                          <p className="text-sm text-white/70">{entry.text}</p>
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
                      
                      {sieResponseText && (
                        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 mr-8">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-purple-400">SIE (responding...)</span>
                          </div>
                          <p className="text-sm text-white/70">{sieResponseText}</p>
                        </div>
                      )}
                      
                      {transcript.length === 0 && !currentUserText && !sieResponseText && !isConnected && (
                        <div className="text-center py-8 text-white/40 text-sm">
                          <Mic className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>Start a voice session to brainstorm with SIE</p>
                          <p className="text-xs mt-1">Discuss priorities, feasibility, and what to build next</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  
                  {showHistory && (
                    <div className="border-t border-white/10 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <History className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-white/70">Saved Sessions</span>
                      </div>
                      
                      {savedSessions.length === 0 ? (
                        <div className="text-center py-6 text-white/40 text-sm">
                          <Calendar className="w-6 h-6 mx-auto mb-2 opacity-50" />
                          <p>No saved sessions yet</p>
                        </div>
                      ) : (
                        <ScrollArea className="h-72">
                          <div className="space-y-2">
                            {savedSessions.map((session) => (
                              <div
                                key={session.id}
                                className="p-3 rounded-lg bg-white/5 border border-white/10 transition-colors"
                                data-testid={`session-${session.id}`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-white/80">{session.title}</span>
                                    <span className="text-xs bg-purple-500/20 px-2 py-0.5 rounded-full text-purple-300">
                                      {session.transcript.length} exchanges
                                    </span>
                                    {session.hasAudio && (
                                      <span className="text-xs bg-green-500/20 px-2 py-0.5 rounded-full text-green-300">
                                        Has Audio
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-3 text-xs text-white/40">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {format(new Date(session.createdAt), 'MMM d, yyyy')}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatDuration(session.durationSeconds)}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
                                      title="View Transcript"
                                      data-testid={`button-expand-session-${session.id}`}
                                    >
                                      {expandedSessionId === session.id ? (
                                        <ChevronUp className="w-4 h-4 text-white/50" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-white/50" />
                                      )}
                                    </Button>
                                    {session.hasAudio && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => handleDownloadAudio(session.id)}
                                        title="Download Audio"
                                        data-testid={`button-download-audio-${session.id}`}
                                      >
                                        <Volume2 className="w-4 h-4 text-green-400/70" />
                                      </Button>
                                    )}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleDownloadTranscript(session)}
                                      title="Download Transcript"
                                      data-testid={`button-download-transcript-${session.id}`}
                                    >
                                      <Download className="w-4 h-4 text-blue-400/70" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleLoadSession(session)}
                                      title="Load to Current Session"
                                      data-testid={`button-load-session-${session.id}`}
                                    >
                                      <MessageSquare className="w-4 h-4 text-white/50" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => deleteSessionMutation.mutate(session.id)}
                                      disabled={deleteSessionMutation.isPending}
                                      title="Delete Session"
                                      data-testid={`button-delete-session-${session.id}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-400/70" />
                                    </Button>
                                  </div>
                                </div>
                                
                                {expandedSessionId === session.id && (
                                  <div className="mt-3 pt-3 border-t border-white/10">
                                    <div className="text-xs text-white/50 mb-2">Transcript:</div>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                      {session.transcript.map((entry, idx) => (
                                        <div
                                          key={idx}
                                          className={`p-2 rounded text-xs ${
                                            entry.role === 'user'
                                              ? 'bg-blue-500/10 border-l-2 border-blue-500'
                                              : 'bg-purple-500/10 border-l-2 border-purple-500'
                                          }`}
                                        >
                                          <span className={`font-medium ${entry.role === 'user' ? 'text-blue-400' : 'text-purple-400'}`}>
                                            {entry.role === 'user' ? 'You' : 'SIE'}:
                                          </span>{' '}
                                          <span className="text-white/70">{entry.text}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <p className="text-xs text-purple-300">
            <strong>SIE v2.0:</strong> Uses Gemini 2.5 Pro for analysis and Gemini Live for voice brainstorming. Run an analysis first, then start a voice session to discuss priorities and plan features together.
          </p>
        </div>
      </div>
    </div>
  );
}

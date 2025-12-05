import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Brain, Play, Pause, Database, Volume2, Loader2, ChevronDown, ChevronUp, Download, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SIEResponse {
  text: string;
  audioBase64?: string;
  audioContentType?: string;
  sessionId: string;
  dataSourcesDiscovered: number;
  processingTimeMs: number;
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

  // Cleanup audio on unmount
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

  const runSIEMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const res = await apiRequest('POST', '/api/sandbox/sie', { generateAudio });
      return await res.json() as SIEResponse;
    },
    onSuccess: (data) => {
      setResponse(data);
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
      // Clean up previous audio
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
      
      audio.onended = () => {
        setIsPlayingAudio(false);
      };
      
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
    <Card className="border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-pink-900/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Brain className="w-5 h-5 text-purple-400" />
          Self-Improvement Engine (SIE)
        </CardTitle>
        <CardDescription className="text-white/60">
          Unrestricted AI analysis of Flō's data landscape. The AI dynamically discovers all data sources and suggests product improvements with verbal output.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
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
              Run SIE Analysis
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
                  <pre className="text-xs text-white/80 whitespace-pre-wrap font-mono">
                    {response.text}
                  </pre>
                </ScrollArea>
              )}
            </div>
          </div>
        )}

        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <p className="text-xs text-purple-300">
            <strong>SIE v1.0:</strong> Uses Gemini 2.5 Pro with unrestricted prompting to analyze the complete data landscape. 
            Dynamically discovers all Supabase and Neon tables, HealthKit metrics, and AI capabilities. 
            Suggests data gaps to fill, features to build, and moonshot opportunities.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  X, 
  Sun, 
  Cloud, 
  CloudRain, 
  CloudSnow, 
  Wind,
  Moon,
  ThumbsUp, 
  ThumbsDown,
  MessageCircle,
  Loader2,
  Battery,
  Bed,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface MorningBriefingData {
  briefing_id: string;
  event_date: string;
  readiness_score: number;
  sleep_data: {
    total_hours: number;
    deep_sleep_minutes: number;
    deep_sleep_quality: 'excellent' | 'good' | 'fair' | 'poor';
    hrv_avg: number | null;
  };
  recent_activity?: {
    type: string;
    when: string;
    impact: string;
  };
  recommendation: string;
  weather?: {
    temp_f: number;
    condition: string;
    description: string;
    humidity: number;
    feels_like_f: number;
  };
  greeting: string;
  readiness_insight: string;
  sleep_insight: string;
}

interface MorningBriefingProps {
  isDark: boolean;
  onClose: () => void;
  onTalkToFlo?: (context: string) => void;
}

function getWeatherIcon(condition: string) {
  const lowerCondition = condition.toLowerCase();
  if (lowerCondition.includes('rain') || lowerCondition.includes('shower')) {
    return CloudRain;
  }
  if (lowerCondition.includes('snow') || lowerCondition.includes('sleet')) {
    return CloudSnow;
  }
  if (lowerCondition.includes('cloud') || lowerCondition.includes('overcast')) {
    return Cloud;
  }
  if (lowerCondition.includes('wind')) {
    return Wind;
  }
  if (lowerCondition.includes('night') || lowerCondition.includes('moon')) {
    return Moon;
  }
  return Sun;
}

function getReadinessColor(score: number): string {
  if (score >= 85) return 'text-green-500';
  if (score >= 70) return 'text-yellow-500';
  if (score >= 50) return 'text-orange-500';
  return 'text-red-500';
}

function getReadinessBg(score: number): string {
  if (score >= 85) return 'bg-green-500/10';
  if (score >= 70) return 'bg-yellow-500/10';
  if (score >= 50) return 'bg-orange-500/10';
  return 'bg-red-500/10';
}

function getSleepQualityColor(quality: string): string {
  switch (quality) {
    case 'excellent': return 'text-green-500';
    case 'good': return 'text-blue-500';
    case 'fair': return 'text-yellow-500';
    case 'poor': return 'text-red-500';
    default: return 'text-muted-foreground';
  }
}

export function MorningBriefing({ isDark, onClose, onTalkToFlo }: MorningBriefingProps) {
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ briefing: MorningBriefingData | null; available: boolean }>({
    queryKey: ['/api/briefing/today'],
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ feedback, comment }: { feedback: 'thumbs_up' | 'thumbs_down'; comment?: string }) => {
      if (!data?.briefing) throw new Error('No briefing to give feedback on');
      return apiRequest('POST', '/api/briefing/feedback', {
        briefingId: data.briefing.briefing_id,
        feedback,
        comment,
      });
    },
    onSuccess: () => {
      setFeedbackSubmitted(true);
      toast({
        title: 'Thanks for the feedback!',
        description: 'Your input helps improve future briefings.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to submit feedback',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleTalkToFlo = () => {
    if (!data?.briefing) return;
    
    const context = `Morning Briefing Context:
Readiness Score: ${data.briefing.readiness_score}
Sleep: ${data.briefing.sleep_data.total_hours.toFixed(1)} hours (${data.briefing.sleep_data.deep_sleep_quality} quality)
Deep Sleep: ${data.briefing.sleep_data.deep_sleep_minutes} minutes
Insight: ${data.briefing.readiness_insight}
Recommendation: ${data.briefing.recommendation}`;
    
    onTalkToFlo?.(context);
    onClose();
  };

  const briefing = data?.briefing;
  const WeatherIcon = briefing?.weather ? getWeatherIcon(briefing.weather.condition) : Sun;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="briefing-modal-overlay"
      />
      
      <div 
        className={`relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl ${
          isDark ? 'bg-zinc-900' : 'bg-white'
        }`}
        data-testid="morning-briefing-modal"
      >
        <div className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
          isDark ? 'bg-zinc-900/95 border-zinc-800' : 'bg-white/95 border-gray-200'
        } backdrop-blur-xl`}>
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Good Morning
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full"
            data-testid="button-close-briefing"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4 pb-safe-area">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className={`text-center py-12 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
              <p>Failed to load briefing</p>
            </div>
          ) : !briefing ? (
            <div className={`text-center py-12 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
              <Moon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium mb-2">No briefing available yet</p>
              <p className="text-sm">Your morning briefing will appear after you wake up.</p>
            </div>
          ) : (
            <>
              <div className={`text-center py-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                <p className="text-base">{briefing.greeting}</p>
              </div>

              {briefing.weather && (
                <Card className={`${isDark ? 'bg-zinc-800/50 border-zinc-700' : 'bg-blue-50 border-blue-100'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                          <WeatherIcon className={`h-6 w-6 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                        </div>
                        <div>
                          <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {briefing.weather.condition}
                          </p>
                          <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                            {briefing.weather.humidity}% humidity
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {briefing.weather.temp_f}°F
                        </p>
                        <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                          Feels like {briefing.weather.feels_like_f}°F
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className={`${getReadinessBg(briefing.readiness_score)} ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-white/80'}`}>
                      <Battery className={`h-8 w-8 ${getReadinessColor(briefing.readiness_score)}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-3xl font-bold ${getReadinessColor(briefing.readiness_score)}`}>
                          {briefing.readiness_score}
                        </span>
                        <span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                          Readiness
                        </span>
                      </div>
                      <p className={`text-sm mt-1 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                        {briefing.readiness_insight}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={`${isDark ? 'bg-zinc-800/50 border-zinc-700' : 'bg-indigo-50 border-indigo-100'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-full ${isDark ? 'bg-indigo-500/20' : 'bg-indigo-100'}`}>
                      <Bed className={`h-5 w-5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                    </div>
                    <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Sleep Summary
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {briefing.sleep_data.total_hours.toFixed(1)}h
                      </p>
                      <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                        Total Sleep
                      </p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {briefing.sleep_data.deep_sleep_minutes}m
                      </p>
                      <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                        Deep Sleep
                      </p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${getSleepQualityColor(briefing.sleep_data.deep_sleep_quality)}`}>
                        {briefing.sleep_data.deep_sleep_quality}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                        Quality
                      </p>
                    </div>
                  </div>

                  <p className={`text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                    {briefing.sleep_insight}
                  </p>
                </CardContent>
              </Card>

              {briefing.recent_activity && (
                <Card className={`${isDark ? 'bg-zinc-800/50 border-zinc-700' : 'bg-orange-50 border-orange-100'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${isDark ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
                        <Activity className={`h-5 w-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                      </div>
                      <div>
                        <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {briefing.recent_activity.type}
                        </p>
                        <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                          {briefing.recent_activity.when} - {briefing.recent_activity.impact}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className={`${isDark ? 'bg-zinc-800/50 border-zinc-700' : 'bg-emerald-50 border-emerald-100'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
                      <TrendingUp className={`h-5 w-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                    </div>
                    <div>
                      <p className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Today's Recommendation
                      </p>
                      <p className={`text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                        {briefing.recommendation}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {!feedbackSubmitted ? (
                <div className="flex items-center justify-center gap-4 py-2">
                  <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                    Was this helpful?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => feedbackMutation.mutate({ feedback: 'thumbs_up' })}
                      disabled={feedbackMutation.isPending}
                      data-testid="button-feedback-up"
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      Yes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => feedbackMutation.mutate({ feedback: 'thumbs_down' })}
                      disabled={feedbackMutation.isPending}
                      data-testid="button-feedback-down"
                    >
                      <ThumbsDown className="h-4 w-4 mr-1" />
                      No
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={`text-center py-2 text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                  Thanks for your feedback!
                </div>
              )}

              {onTalkToFlo && (
                <Button
                  onClick={handleTalkToFlo}
                  className="w-full"
                  size="lg"
                  data-testid="button-talk-to-flo"
                >
                  <MessageCircle className="h-5 w-5 mr-2" />
                  Talk to Flo About This
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function MorningBriefingTile({ isDark, onClick }: { isDark: boolean; onClick: () => void }) {
  const { data, isLoading } = useQuery<{ briefing: MorningBriefingData | null; available: boolean }>({
    queryKey: ['/api/briefing/today'],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data?.available || !data?.briefing) {
    return null;
  }

  const briefing = data.briefing;
  const WeatherIcon = briefing.weather ? getWeatherIcon(briefing.weather.condition) : Sun;

  return (
    <Card
      className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${
        isDark ? 'bg-gradient-to-br from-indigo-900/50 to-purple-900/50 border-indigo-700' : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200'
      }`}
      onClick={onClick}
      data-testid="tile-morning-briefing"
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sun className={`h-5 w-5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Morning Briefing
            </span>
          </div>
          {briefing.weather && (
            <div className="flex items-center gap-1">
              <WeatherIcon className={`h-4 w-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <span className={`text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                {briefing.weather.temp_f}°
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${getReadinessBg(briefing.readiness_score)}`}>
            <Battery className={`h-6 w-6 ${getReadinessColor(briefing.readiness_score)}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${getReadinessColor(briefing.readiness_score)}`}>
                {briefing.readiness_score}
              </span>
              <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Readiness
              </span>
            </div>
            <p className={`text-sm truncate ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
              {briefing.sleep_data.total_hours.toFixed(1)}h sleep · {briefing.sleep_data.deep_sleep_minutes}m deep
            </p>
          </div>
        </div>

        <p className={`mt-3 text-sm line-clamp-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
          {briefing.recommendation}
        </p>
      </CardContent>
    </Card>
  );
}

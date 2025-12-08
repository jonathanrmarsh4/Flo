import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  Sun, 
  Cloud, 
  CloudRain, 
  CloudSnow, 
  Wind,
  Moon,
  Sunrise,
  Battery,
  Bed,
  ThumbsUp, 
  ThumbsDown,
  MessageCircle,
  Loader2,
  X,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface MorningBriefingTileProps {
  isDark: boolean;
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

function getReadinessColor(score: number, isDark: boolean): string {
  if (score >= 85) return isDark ? 'text-green-400' : 'text-green-600';
  if (score >= 70) return isDark ? 'text-yellow-400' : 'text-yellow-600';
  if (score >= 50) return isDark ? 'text-orange-400' : 'text-orange-600';
  return isDark ? 'text-red-400' : 'text-red-600';
}

function getReadinessBgGradient(score: number, isDark: boolean): string {
  if (score >= 85) return isDark 
    ? 'from-green-900/30 via-emerald-900/30 to-teal-900/30' 
    : 'from-green-50 via-emerald-50 to-teal-50';
  if (score >= 70) return isDark 
    ? 'from-yellow-900/30 via-amber-900/30 to-orange-900/30' 
    : 'from-yellow-50 via-amber-50 to-orange-50';
  if (score >= 50) return isDark 
    ? 'from-orange-900/30 via-amber-900/30 to-red-900/30' 
    : 'from-orange-50 via-amber-50 to-red-50';
  return isDark 
    ? 'from-red-900/30 via-rose-900/30 to-pink-900/30' 
    : 'from-red-50 via-rose-50 to-pink-50';
}

function getSleepQualityColor(quality: string, isDark: boolean): string {
  switch (quality) {
    case 'excellent': return isDark ? 'text-green-400' : 'text-green-600';
    case 'good': return isDark ? 'text-blue-400' : 'text-blue-600';
    case 'fair': return isDark ? 'text-yellow-400' : 'text-yellow-600';
    case 'poor': return isDark ? 'text-red-400' : 'text-red-600';
    default: return isDark ? 'text-white/60' : 'text-gray-500';
  }
}

export function MorningBriefingTile({ isDark, onTalkToFlo }: MorningBriefingTileProps) {
  const [showModal, setShowModal] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ briefing: MorningBriefingData | null; available: boolean }>({
    queryKey: ['/api/briefing/today'],
    staleTime: 5 * 60 * 1000,
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
Deep Sleep: ${data.briefing.sleep_data.deep_sleep_minutes.toFixed(0)} minutes
Insight: ${data.briefing.readiness_insight}
Recommendation: ${data.briefing.recommendation}`;
    
    onTalkToFlo?.(context);
    setShowModal(false);
  };

  if (isLoading || !data?.available || !data?.briefing) {
    return null;
  }

  const briefing = data.briefing;
  const WeatherIcon = briefing.weather ? getWeatherIcon(briefing.weather.condition) : Sun;

  return (
    <>
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover-elevate active-elevate-2 ${
          isDark 
            ? `bg-gradient-to-br from-amber-900/40 via-orange-900/40 to-yellow-900/40 border-white/20` 
            : `bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border-black/10`
        }`}
        onClick={() => setShowModal(true)}
        data-testid="tile-morning-briefing"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sunrise className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Morning Briefing
            </h3>
          </div>
          {briefing.weather && (
            <div className="flex items-center gap-1.5">
              <WeatherIcon className={`h-4 w-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <span className={`text-sm font-medium ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                {Math.round(briefing.weather.temp_f)}°F
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className={`flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${getReadinessBgGradient(briefing.readiness_score, isDark)}`}>
            <div className="text-center">
              <span className={`text-2xl font-bold ${getReadinessColor(briefing.readiness_score, isDark)}`}>
                {briefing.readiness_score}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs uppercase tracking-wide mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Readiness Score
            </p>
            <p className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
              {briefing.sleep_data.total_hours.toFixed(1)}h sleep · {briefing.sleep_data.deep_sleep_minutes.toFixed(0)}m deep
            </p>
          </div>
        </div>

        <p className={`text-sm line-clamp-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
          {briefing.recommendation}
        </p>

        <div className={`mt-3 pt-3 border-t flex items-center justify-between ${
          isDark ? 'border-white/10' : 'border-black/5'
        }`}>
          <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
            Tap for details
          </span>
          <Sparkles className={`w-4 h-4 ${isDark ? 'text-amber-400/60' : 'text-amber-500/60'}`} />
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
            data-testid="briefing-modal-overlay"
          />
          
          <div 
            className={`relative w-full max-w-lg rounded-t-3xl ${
              isDark 
                ? 'bg-gradient-to-b from-slate-900 to-slate-950' 
                : 'bg-gradient-to-b from-white to-gray-50'
            }`}
            style={{ maxHeight: '85vh' }}
            data-testid="morning-briefing-modal"
          >
            <div className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b rounded-t-3xl ${
              isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white/95 border-black/5'
            } backdrop-blur-xl`}>
              <div className="flex items-center gap-2">
                <Sunrise className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Good Morning
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowModal(false)}
                className="rounded-full"
                data-testid="button-close-briefing"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 64px)' }}>
              <div className="p-4 space-y-4 pb-8">
                <div className={`text-center py-2 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                  <p className="text-base">{briefing.greeting}</p>
                </div>

                {briefing.weather && (
                  <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
                    isDark 
                      ? 'bg-gradient-to-br from-blue-900/30 via-sky-900/30 to-cyan-900/30 border-white/10' 
                      : 'bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 border-black/5'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                          <WeatherIcon className={`h-6 w-6 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                        </div>
                        <div>
                          <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {briefing.weather.condition}
                          </p>
                          <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                            Feels like {Math.round(briefing.weather.feels_like_f)}°F
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {Math.round(briefing.weather.temp_f)}°
                        </p>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {briefing.weather.humidity}% humidity
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
                  isDark 
                    ? `bg-gradient-to-br ${getReadinessBgGradient(briefing.readiness_score, isDark)} border-white/10` 
                    : `bg-gradient-to-br ${getReadinessBgGradient(briefing.readiness_score, isDark)} border-black/5`
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-white/10' : 'bg-black/5'}`}>
                      <Battery className={`h-5 w-5 ${getReadinessColor(briefing.readiness_score, isDark)}`} />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-3xl font-bold ${getReadinessColor(briefing.readiness_score, isDark)}`}>
                        {briefing.readiness_score}
                      </span>
                      <span className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                        Readiness
                      </span>
                    </div>
                  </div>
                  <p className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                    {briefing.readiness_insight}
                  </p>
                </div>

                <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
                  isDark 
                    ? 'bg-gradient-to-br from-indigo-900/30 via-purple-900/30 to-violet-900/30 border-white/10' 
                    : 'bg-gradient-to-br from-indigo-50 via-purple-50 to-violet-50 border-black/5'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Bed className={`h-5 w-5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                    <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Sleep Summary
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div className="text-center">
                      <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {briefing.sleep_data.total_hours.toFixed(1)}h
                      </p>
                      <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        Total Sleep
                      </p>
                    </div>
                    <div className="text-center">
                      <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {briefing.sleep_data.deep_sleep_minutes.toFixed(0)}m
                      </p>
                      <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        Deep Sleep
                      </p>
                    </div>
                    <div className="text-center">
                      <p className={`text-xl font-bold capitalize ${getSleepQualityColor(briefing.sleep_data.deep_sleep_quality, isDark)}`}>
                        {briefing.sleep_data.deep_sleep_quality}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        Quality
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    {briefing.sleep_insight}
                  </p>
                </div>

                <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
                  isDark 
                    ? 'bg-gradient-to-br from-emerald-900/30 via-green-900/30 to-teal-900/30 border-white/10' 
                    : 'bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border-black/5'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className={`h-5 w-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                    <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Today's Recommendation
                    </span>
                  </div>
                  <p className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                    {briefing.recommendation}
                  </p>
                </div>

                {!feedbackSubmitted ? (
                  <div className={`flex items-center justify-center gap-4 py-3 px-4 rounded-2xl ${
                    isDark ? 'bg-white/5' : 'bg-black/5'
                  }`}>
                    <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                      Was this helpful?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => feedbackMutation.mutate({ feedback: 'thumbs_up' })}
                        disabled={feedbackMutation.isPending}
                        className={isDark ? 'border-white/20 hover:bg-white/10' : ''}
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
                        className={isDark ? 'border-white/20 hover:bg-white/10' : ''}
                        data-testid="button-feedback-down"
                      >
                        <ThumbsDown className="h-4 w-4 mr-1" />
                        No
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={`text-center py-3 text-sm rounded-2xl ${
                    isDark ? 'bg-white/5 text-white/60' : 'bg-black/5 text-gray-500'
                  }`}>
                    Thanks for your feedback!
                  </div>
                )}

                {onTalkToFlo && (
                  <Button
                    onClick={handleTalkToFlo}
                    className={`w-full h-12 rounded-2xl ${
                      isDark 
                        ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500' 
                        : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400'
                    }`}
                    size="lg"
                    data-testid="button-talk-to-flo"
                  >
                    <MessageCircle className="h-5 w-5 mr-2" />
                    Talk to Flo About This
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

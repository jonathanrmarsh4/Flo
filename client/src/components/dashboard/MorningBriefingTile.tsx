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
  Zap,
  ThumbsUp, 
  ThumbsDown,
  MessageCircle,
  X,
  Droplets,
  Thermometer,
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
    temp_c: number;
    condition: string;
    description: string;
    humidity: number;
    feels_like_f: number;
    feels_like_c: number;
  };
  greeting: string;
  readiness_insight: string;
  sleep_insight: string;
}

interface MorningBriefingTileProps {
  isDark: boolean;
  onTalkToFlo?: (context: string) => void;
  useMetric?: boolean;
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
  if (score >= 85) return 'text-green-400';
  if (score >= 70) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
}

function getReadinessBarColor(score: number): string {
  if (score >= 85) return 'bg-green-500';
  if (score >= 70) return 'bg-yellow-500';
  if (score >= 50) return 'bg-orange-500';
  return 'bg-red-500';
}

function getSleepQualityColor(quality: string): string {
  switch (quality) {
    case 'excellent': return 'text-green-400';
    case 'good': return 'text-blue-400';
    case 'fair': return 'text-yellow-400';
    case 'poor': return 'text-red-400';
    default: return 'text-white/60';
  }
}

function isMorningHours(): boolean {
  // TODO: Restore morning-only visibility (4 AM - 12 PM) after testing
  // const hour = new Date().getHours();
  // return hour >= 4 && hour < 12;
  return true; // Temporarily show 24/7 for testing
}

export function MorningBriefingTile({ isDark, onTalkToFlo, useMetric = true }: MorningBriefingTileProps) {
  const [showModal, setShowModal] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ briefing: MorningBriefingData | null; available: boolean }>({
    queryKey: ['/api/briefing/today'],
    staleTime: 5 * 60 * 1000,
    enabled: isMorningHours(),
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

  if (!isMorningHours() || isLoading || !data?.available || !data?.briefing) {
    return null;
  }

  const briefing = data.briefing;
  const WeatherIcon = briefing.weather ? getWeatherIcon(briefing.weather.condition) : Sun;

  return (
    <>
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover-elevate active-elevate-2 ${
          isDark 
            ? 'bg-gradient-to-br from-purple-900/50 via-violet-900/40 to-fuchsia-900/30 border-white/20' 
            : 'bg-gradient-to-br from-purple-50 via-violet-50 to-fuchsia-50 border-black/10'
        }`}
        onClick={() => setShowModal(true)}
        data-testid="tile-morning-briefing"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sun className={`w-5 h-5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Morning Briefing
            </h3>
          </div>
          {briefing.weather && (
            <div className="flex items-center gap-1.5">
              <WeatherIcon className={`h-4 w-4 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
              <span className={`text-sm font-medium ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                {useMetric 
                  ? `${Math.round(briefing.weather.temp_c)}°C`
                  : `${Math.round(briefing.weather.temp_f)}°F`
                }
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className={`flex items-center justify-center w-16 h-16 rounded-2xl ${
            isDark ? 'bg-white/10' : 'bg-black/5'
          }`}>
            <span className={`text-2xl font-bold ${getReadinessColor(briefing.readiness_score)}`}>
              {briefing.readiness_score}
            </span>
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
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
            data-testid="briefing-modal-overlay"
          />
          
          <div 
            className="relative flex flex-col h-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950"
            data-testid="morning-briefing-modal"
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-white/10 transition-colors"
              data-testid="button-close-briefing"
            >
              <X className="h-6 w-6 text-white/60" />
            </button>

            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-6 pt-12 pb-4">
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <Sun className="w-10 h-10 text-yellow-400" />
                  </div>
                </div>

                <div className="text-center mb-8">
                  <h1 className="text-2xl font-semibold text-white mb-1">
                    {briefing.greeting.split('.')[0]}
                  </h1>
                  <p className="text-white/60">
                    Here's your morning briefing
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-800/60 rounded-2xl p-5 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-400" />
                        <span className="text-white font-medium">Readiness Score</span>
                      </div>
                      <span className={`text-3xl font-bold ${getReadinessColor(briefing.readiness_score)}`}>
                        {briefing.readiness_score}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${getReadinessBarColor(briefing.readiness_score)}`}
                        style={{ width: `${briefing.readiness_score}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-800/60 rounded-2xl p-5 border border-white/10">
                    <div className="flex items-center gap-2 mb-3">
                      <Moon className="w-5 h-5 text-indigo-400" />
                      <span className="text-white font-medium">Sleep Quality</span>
                    </div>
                    <p className="text-white/80 mb-3">
                      Your deep sleep was <span className={getSleepQualityColor(briefing.sleep_data.deep_sleep_quality)}>
                        {briefing.sleep_data.deep_sleep_quality}
                      </span> ({briefing.sleep_data.deep_sleep_minutes.toFixed(0)} min)
                      {briefing.recent_activity && `, likely driven by that ${briefing.recent_activity.type} ${briefing.recent_activity.when}.`}
                    </p>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-white/60">
                        <span className="text-white font-medium">{briefing.sleep_data.total_hours.toFixed(1)}h</span> total
                      </span>
                      {briefing.sleep_data.hrv_avg && (
                        <span className="text-white/60">
                          <span className="text-white font-medium">{Math.round(briefing.sleep_data.hrv_avg)}</span> HRV avg
                        </span>
                      )}
                    </div>
                  </div>

                  {briefing.weather && (
                    <div className="bg-slate-800/60 rounded-2xl p-5 border border-white/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <WeatherIcon className="w-8 h-8 text-yellow-400" />
                          <div>
                            <p className="text-2xl font-bold text-white">
                              {useMetric 
                                ? `${Math.round(briefing.weather.temp_c)}°C`
                                : `${Math.round(briefing.weather.temp_f)}°F`
                              }
                            </p>
                            <p className="text-white/60 text-sm">
                              {briefing.weather.condition}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <Thermometer className="w-4 h-4 text-white/40" />
                            <span className="text-white/60">
                              Feels {useMetric 
                                ? `${Math.round(briefing.weather.feels_like_c)}°`
                                : `${Math.round(briefing.weather.feels_like_f)}°`
                              }
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Droplets className="w-4 h-4 text-white/40" />
                            <span className="text-white/60">
                              {briefing.weather.humidity}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-800/60 rounded-2xl p-5 border border-pink-500/30 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-pink-500 to-purple-500" />
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      </div>
                      <span className="text-white font-medium">Today's Recommendation</span>
                    </div>
                    <p className="text-white/80 leading-relaxed">
                      {briefing.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 px-6 pb-6 pt-2 bg-gradient-to-t from-slate-950 to-transparent">
              {!feedbackSubmitted ? (
                <div className="flex items-center justify-center gap-4 py-3">
                  <button
                    onClick={() => feedbackMutation.mutate({ feedback: 'thumbs_up' })}
                    disabled={feedbackMutation.isPending}
                    className="p-3 rounded-full bg-slate-800/60 border border-white/10 hover:bg-white/10 transition-colors"
                    data-testid="button-feedback-up"
                  >
                    <ThumbsUp className="h-5 w-5 text-white/60" />
                  </button>
                  <button
                    onClick={() => feedbackMutation.mutate({ feedback: 'thumbs_down' })}
                    disabled={feedbackMutation.isPending}
                    className="p-3 rounded-full bg-slate-800/60 border border-white/10 hover:bg-white/10 transition-colors"
                    data-testid="button-feedback-down"
                  >
                    <ThumbsDown className="h-5 w-5 text-white/60" />
                  </button>
                </div>
              ) : (
                <div className="text-center py-3 text-sm text-white/60">
                  Thanks for your feedback!
                </div>
              )}

              <button
                onClick={handleTalkToFlo}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                data-testid="button-talk-to-flo"
              >
                <MessageCircle className="h-5 w-5" />
                Get your briefing from Flō
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

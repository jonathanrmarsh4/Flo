import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft,
  Play, 
  Pause, 
  CheckCircle, 
  Clock, 
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  MessageSquare,
  BarChart3,
  X,
  Activity
} from "lucide-react";
import { SUPPLEMENT_CONFIGURATIONS, type SupplementTypeConfig } from "@shared/supplementConfig";
import { FloBottomNav } from "@/components/FloBottomNav";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ExperimentData {
  experiment: {
    id: string;
    supplement_type_id: string;
    product_name: string;
    product_brand?: string;
    product_image_url?: string;
    primary_intent: string;
    status: string;
    baseline_days: number;
    experiment_days: number;
    dosage_amount: number;
    dosage_unit: string;
    dosage_timing: string;
    created_at: string;
    experiment_start_date?: string;
    experiment_end_date?: string;
  };
  metrics: Array<{
    metric_name: string;
    metric_type: string;
  }>;
}

interface CheckinData {
  checkins: Array<{
    id: string;
    checkin_date: string;
    phase: string;
    ratings: Record<string, number>;
    notes?: string;
  }>;
}

interface ResultsData {
  results: {
    overall_verdict: string;
    overall_effect_size: number;
    confidence_level?: number;
    metric_results: Array<{
      metric_name: string;
      effect_size: number;
      baseline_mean: number;
      experiment_mean: number;
      verdict: string;
    }>;
    ai_summary?: string;
  };
}

export default function AssessmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [checkinRatings, setCheckinRatings] = useState<Record<string, number>>({});
  const [checkinNotes, setCheckinNotes] = useState('');

  // Fetch assessment details
  const { data: experimentData, isLoading } = useQuery<ExperimentData>({
    queryKey: ['/api/n1/experiments', id],
  });

  // Fetch check-ins
  const { data: checkinsData } = useQuery<CheckinData>({
    queryKey: ['/api/n1/experiments', id, 'checkins'],
    enabled: !!experimentData,
  });

  // Fetch results if completed
  const { data: resultsData } = useQuery<ResultsData>({
    queryKey: ['/api/n1/experiments', id, 'results'],
    enabled: experimentData?.experiment.status === 'completed',
  });

  // Start assessment mutation
  const startAssessmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/n1/experiments/${id}/start`, { useRetroactiveBaseline: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/n1/experiments', id] });
      toast({
        title: "Assessment Started",
        description: "Your assessment is now active. Don't forget your daily check-ins!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start assessment",
        variant: "destructive",
      });
    },
  });

  // Submit check-in mutation
  const submitCheckinMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/n1/experiments/${id}/checkin`, {
        ratings: checkinRatings,
        notes: checkinNotes,
        source: 'manual',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/n1/experiments', id, 'checkins'] });
      setShowCheckinForm(false);
      setCheckinRatings({});
      setCheckinNotes('');
      toast({
        title: "Check-in Recorded",
        description: "Thanks for logging today's data!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record check-in",
        variant: "destructive",
      });
    },
  });

  // Pause/Resume mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest('PATCH', `/api/n1/experiments/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/n1/experiments', id] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-cyan-400 rounded-full" />
      </div>
    );
  }

  if (!experimentData) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
        <p className="text-white/60">Assessment not found</p>
      </div>
    );
  }

  const { experiment, metrics } = experimentData;
  const supplementConfig = SUPPLEMENT_CONFIGURATIONS[experiment.supplement_type_id];
  const checkins = checkinsData?.checkins || [];

  const getStatusInfo = () => {
    switch (experiment.status) {
      case 'pending':
        return { label: 'Ready to Start', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock };
      case 'baseline':
        return { label: 'Collecting Baseline', color: 'bg-blue-500/20 text-blue-400', icon: Clock };
      case 'active':
        return { label: 'Active', color: 'bg-green-500/20 text-green-400', icon: Play };
      case 'paused':
        return { label: 'Paused', color: 'bg-orange-500/20 text-orange-400', icon: Pause };
      case 'completed':
        return { label: 'Completed', color: 'bg-cyan-500/20 text-cyan-400', icon: CheckCircle };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-red-500/20 text-red-400', icon: X };
      default:
        return { label: experiment.status, color: 'bg-white/20 text-white', icon: Clock };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Calculate progress
  let progress = 0;
  let daysElapsed = 0;
  if (experiment.status === 'active' && experiment.experiment_start_date) {
    const startDate = new Date(experiment.experiment_start_date);
    const now = new Date();
    daysElapsed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    progress = Math.min(100, Math.round((daysElapsed / experiment.experiment_days) * 100));
  } else if (experiment.status === 'completed') {
    progress = 100;
    daysElapsed = experiment.experiment_days;
  }

  const subjectiveMetrics = metrics.filter(m => m.metric_type === 'subjective');

  // Generate chart data from check-ins
  const chartData = useMemo(() => {
    if (!checkins.length) return [];
    
    // Sort checkins by date
    const sortedCheckins = [...checkins].sort((a, b) => 
      new Date(a.checkin_date).getTime() - new Date(b.checkin_date).getTime()
    );
    
    return sortedCheckins.map((checkin, index) => {
      const date = new Date(checkin.checkin_date);
      const dataPoint: Record<string, any> = {
        day: index + 1,
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
      
      // Add each rating to the data point
      if (checkin.ratings) {
        Object.entries(checkin.ratings).forEach(([key, value]) => {
          dataPoint[key] = value;
        });
      }
      
      return dataPoint;
    });
  }, [checkins]);

  // Get metric names from check-in ratings for chart legend
  const chartMetricNames = useMemo(() => {
    if (!checkins.length || !checkins[0]?.ratings) return [];
    return Object.keys(checkins[0].ratings);
  }, [checkins]);

  // Line colors for different metrics
  const metricColors = ['#22d3ee', '#a855f7', '#22c55e', '#f97316', '#ec4899'];

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="backdrop-blur-xl rounded-lg border p-3 shadow-lg bg-slate-900/95 border-white/20">
          <p className="text-xs mb-2 text-white/60">{payload[0]?.payload?.date}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm text-white">
              <span className="font-medium" style={{ color: entry.color }}>{entry.name}:</span> {entry.value?.toFixed(1)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b bg-white/5 border-white/10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setLocation('/actions')}
              className="text-white/70 hover:text-white hover:bg-white/10"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg text-white font-medium truncate">{experiment.product_name}</h1>
              <p className="text-xs text-white/50">
                {supplementConfig?.name}
              </p>
            </div>
            <Badge className={`${statusInfo.color} border-0`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusInfo.label}
            </Badge>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="overflow-y-auto px-4 py-6 pb-32" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Progress Card */}
        {experiment.status === 'active' && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/70 text-sm">Assessment Progress</span>
              <span className="text-white font-medium">Day {daysElapsed + 1} of {experiment.experiment_days}</span>
            </div>
            <Progress value={progress} className="h-2 bg-white/10" />
            <p className="text-xs text-white/50 mt-2">
              {experiment.experiment_days - daysElapsed} days remaining
            </p>
            
            {/* Tracking For badges */}
            {supplementConfig && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide mb-2 text-white/50">Tracking For</p>
                <div className="flex flex-wrap gap-2">
                  {supplementConfig.subjectiveMetrics.slice(0, 4).map((m) => (
                    <span 
                      key={m.metric}
                      className="px-3 py-1 rounded-full text-xs bg-purple-500/10 text-purple-300 border border-purple-500/30"
                    >
                      {m.metric}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Metrics Trend Chart */}
        {(experiment.status === 'active' || experiment.status === 'completed') && chartData.length > 1 && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Metrics Trend</h3>
                <p className="text-xs text-white/60">Your progress over time</p>
              </div>
            </div>
            
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis 
                    dataKey="day" 
                    stroke="#ffffff40" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    domain={[0, 10]} 
                    stroke="#ffffff40" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={25}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {chartMetricNames.map((metricName, index) => (
                    <Line
                      key={metricName}
                      type="monotone"
                      dataKey={metricName}
                      stroke={metricColors[index % metricColors.length]}
                      strokeWidth={2}
                      dot={false}
                      name={metricName}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex flex-wrap gap-3">
                {chartMetricNames.map((metricName, index) => (
                  <div key={metricName} className="flex items-center gap-1.5">
                    <div 
                      className="w-3 h-0.5 rounded-full"
                      style={{ backgroundColor: metricColors[index % metricColors.length] }}
                    />
                    <span className="text-xs text-white/70">{metricName}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Action Buttons */}
        {experiment.status === 'pending' && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <FlaskConical className="w-6 h-6 text-cyan-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-medium">Ready to Start</h3>
                <p className="text-sm text-white/70">Begin your assessment when you're ready</p>
              </div>
            </div>
            <Button
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500"
              onClick={() => startAssessmentMutation.mutate()}
              disabled={startAssessmentMutation.isPending}
              data-testid="button-start-assessment"
            >
              {startAssessmentMutation.isPending ? 'Starting...' : 'Start Assessment'}
            </Button>
          </Card>
        )}

        {/* Daily Check-in */}
        {experiment.status === 'active' && !showCheckinForm && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Daily Check-in</h3>
                  <p className="text-xs text-white/60">{checkins.length} check-ins recorded</p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-green-500/20 text-green-400 hover:bg-green-500/30"
                onClick={() => setShowCheckinForm(true)}
                data-testid="button-open-checkin"
              >
                Log Today
              </Button>
            </div>
          </Card>
        )}

        {/* Check-in Form */}
        {showCheckinForm && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium">Today's Check-in</h3>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowCheckinForm(false)}
                className="text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {subjectiveMetrics.map((metric) => (
                <div key={metric.metric_name}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/70 text-sm">{metric.metric_name}</span>
                    <span className="text-white font-medium">
                      {checkinRatings[metric.metric_name] || 5}/10
                    </span>
                  </div>
                  <Slider
                    value={[checkinRatings[metric.metric_name] || 5]}
                    onValueChange={([value]) => setCheckinRatings({ ...checkinRatings, [metric.metric_name]: value })}
                    min={1}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                </div>
              ))}

              <div>
                <span className="text-white/70 text-sm">Notes (optional)</span>
                <Textarea
                  value={checkinNotes}
                  onChange={(e) => setCheckinNotes(e.target.value)}
                  placeholder="How are you feeling today?"
                  className="mt-1 bg-white/5 border-white/20 text-white placeholder:text-white/30"
                  data-testid="input-checkin-notes"
                />
              </div>

              <Button
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-500"
                onClick={() => submitCheckinMutation.mutate()}
                disabled={submitCheckinMutation.isPending}
                data-testid="button-submit-checkin"
              >
                {submitCheckinMutation.isPending ? 'Saving...' : 'Save Check-in'}
              </Button>
            </div>
          </Card>
        )}

        {/* Results (if completed) */}
        {experiment.status === 'completed' && resultsData?.results && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Assessment Results</h3>
                <p className="text-xs text-white/60">Analysis complete</p>
              </div>
            </div>

            {/* Overall Verdict */}
            <div className={`p-4 rounded-xl mb-4 ${
              resultsData.results.overall_verdict === 'strong_evidence' 
                ? 'bg-green-500/10 border border-green-500/30'
                : resultsData.results.overall_verdict === 'moderate_evidence'
                ? 'bg-yellow-500/10 border border-yellow-500/30'
                : 'bg-red-500/10 border border-red-500/30'
            }`}>
              <div className="flex items-center gap-2">
                {resultsData.results.overall_verdict === 'strong_evidence' ? (
                  <TrendingUp className="w-5 h-5 text-green-400" />
                ) : resultsData.results.overall_verdict === 'moderate_evidence' ? (
                  <Minus className="w-5 h-5 text-yellow-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
                <span className={`font-medium ${
                  resultsData.results.overall_verdict === 'strong_evidence' 
                    ? 'text-green-400'
                    : resultsData.results.overall_verdict === 'moderate_evidence'
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}>
                  {resultsData.results.overall_verdict === 'strong_evidence' 
                    ? 'Strong Evidence of Effect'
                    : resultsData.results.overall_verdict === 'moderate_evidence'
                    ? 'Moderate Evidence'
                    : 'No Clear Effect'}
                </span>
              </div>
              <p className="text-sm text-white/60 mt-2">
                Effect Size: {resultsData.results.overall_effect_size.toFixed(2)} | 
                Confidence: {Math.round((resultsData.results.confidence_level || 0.7) * 100)}%
              </p>
            </div>

            {/* Individual Metrics */}
            <div className="space-y-3">
              {resultsData.results.metric_results.map((metric) => (
                <div key={metric.metric_name} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-white/70 text-sm">{metric.metric_name}</span>
                  <div className="text-right">
                    <span className={`text-sm font-medium ${
                      metric.verdict === 'strong_evidence' ? 'text-green-400' :
                      metric.verdict === 'moderate_evidence' ? 'text-yellow-400' : 'text-white/60'
                    }`}>
                      {metric.effect_size > 0 ? '+' : ''}{metric.effect_size.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {resultsData.results.ai_summary && (
              <div className="mt-4 p-3 bg-white/5 rounded-lg">
                <p className="text-sm text-white/70">{resultsData.results.ai_summary}</p>
              </div>
            )}
          </Card>
        )}

        {/* Assessment Details */}
        <Card className="p-4 bg-white/5 border-white/10 mb-4">
          <h3 className="text-white font-medium mb-3">Assessment Details</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Dosage</span>
              <span className="text-white">{experiment.dosage_amount}{experiment.dosage_unit}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Timing</span>
              <span className="text-white capitalize">{experiment.dosage_timing}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Duration</span>
              <span className="text-white">{experiment.experiment_days} days</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Started</span>
              <span className="text-white">
                {experiment.experiment_start_date 
                  ? new Date(experiment.experiment_start_date).toLocaleDateString()
                  : 'Not started'
                }
              </span>
            </div>
          </div>
        </Card>

        {/* Check-in History */}
        {checkins.length > 0 && (
          <Card className="p-4 bg-white/5 border-white/10">
            <h3 className="text-white font-medium mb-3">Recent Check-ins</h3>
            <div className="space-y-2">
              {checkins.slice(0, 5).map((checkin) => (
                <div key={checkin.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-white/40" />
                    <span className="text-sm text-white/70">
                      {new Date(checkin.checkin_date).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge className="bg-white/10 text-white/60 border-0 text-xs">
                    {checkin.phase}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>

      {/* Bottom Navigation */}
      <FloBottomNav />
    </div>
  );
}

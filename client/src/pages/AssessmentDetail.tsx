import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
  Activity,
  Trash2,
  AlertTriangle,
  Brain,
  Heart,
  Moon
} from "lucide-react";
import { SUPPLEMENT_CONFIGURATIONS, type SupplementTypeConfig } from "@shared/supplementConfig";
import { FloBottomNav } from "@/components/FloBottomNav";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

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

interface ObjectiveMetricsData {
  metrics: Array<{
    date: string;
    hrv?: number;
    deepSleepPct?: number;
    restingHeartRate?: number;
    sleepEfficiency?: number;
  }>;
}

export default function AssessmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [checkinRatings, setCheckinRatings] = useState<Record<string, number>>({});
  const [checkinNotes, setCheckinNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // FROZEN BASELINE: Once computed, baseline stats are persisted and never recomputed
  // Keyed by BOTH experiment ID and start date to prevent cross-experiment leakage
  const frozenBaselineRef = useRef<{
    objectiveBaselines: Record<string, { mean: number; stdDev: number } | null>;
    subjectiveBaselines: Record<string, { mean: number; stdDev: number } | null>;
    frozenForExperimentId: string;
    frozenForStartDate: string;
  } | null>(null);

  // Clear frozen baseline when navigating to a different experiment
  useEffect(() => {
    if (id && frozenBaselineRef.current?.frozenForExperimentId !== id) {
      frozenBaselineRef.current = null;
    }
  }, [id]);

  // Fetch assessment details
  const { data: experimentData, isLoading, isError, error } = useQuery<ExperimentData>({
    queryKey: ['/api/n1/experiments', id],
  });

  // Fetch check-ins
  const { data: checkinsData } = useQuery<CheckinData>({
    queryKey: ['/api/n1/experiments', id, 'checkins'],
    enabled: !!experimentData,
  });

  // Fetch objective HealthKit metrics (HRV, Deep Sleep, etc.)
  const { data: objectiveData } = useQuery<ObjectiveMetricsData>({
    queryKey: ['/api/n1/experiments', id, 'objective-metrics'],
    enabled: !!experimentData && (experimentData.experiment.status === 'active' || experimentData.experiment.status === 'completed'),
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

  // Delete/Cancel assessment mutation
  const deleteAssessmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('PATCH', `/api/n1/experiments/${id}/status`, { status: 'cancelled' });
    },
    onSuccess: () => {
      // Invalidate both list and detail queries to prevent stale cache
      queryClient.invalidateQueries({ queryKey: ['/api/n1/experiments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/n1/experiments', id] });
      setShowDeleteConfirm(false);
      toast({
        title: "Assessment Deleted",
        description: "The assessment has been cancelled and removed.",
      });
      setLocation('/actions');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete assessment",
        variant: "destructive",
      });
    },
  });

  // Get checkins from query data (need to access before useMemo)
  const checkins = checkinsData?.checkins || [];
  const objectiveMetrics = objectiveData?.metrics || [];

  // Helper to format metric key to display name
  const formatMetricName = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Z-SCORE DEVIATION PLOT: Calculate composite Z-scores for deviation chart
  // Formula: Z = (DailyValue - BaselineAvg) / BaselineStdDev × Polarity
  // Polarity: +1 for "higher is better" (HRV, Sleep), -1 for "lower is better" (RHR, Stress)
  
  // Metric polarity configuration - matches the JSON spec
  const METRIC_POLARITIES = useMemo(() => ({
    // Objective metrics
    hrv: 1,           // Higher HRV is better
    deepSleepPct: 1,  // Higher deep sleep is better
    sleepDuration: 1, // Longer sleep is better
    restingHeartRate: -1, // Lower RHR is better
    // Subjective metrics  
    sleep_quality: 1, // Higher rating is better
    recovery: 1,      // Higher rating is better
    stress_level: -1, // Lower stress is better (but rating is 0-10 where 10=stressed)
  }), []);
  
  // Get supplement start date for vertical marker
  const supplementStartDate = experimentData?.experiment?.experiment_start_date 
    ? new Date(experimentData.experiment.experiment_start_date).toISOString().split('T')[0]
    : null;

  // Generate Z-SCORE COMPOSITE chart data
  const chartData = useMemo(() => {
    if (!checkins.length && !objectiveMetrics.length) return [];
    
    // Create a map of dates to raw data points
    const dateMap = new Map<string, Record<string, any>>();
    
    // Add subjective check-in data
    checkins.forEach((checkin) => {
      const dateKey = checkin.checkin_date.split('T')[0];
      const existing = dateMap.get(dateKey) || { dateKey };
      
      if (checkin.ratings && Object.keys(checkin.ratings).length > 0) {
        Object.entries(checkin.ratings).forEach(([key, value]) => {
          const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
          existing[normalizedKey] = value;
        });
      }
      dateMap.set(dateKey, existing);
    });
    
    // Add objective HealthKit data
    objectiveMetrics.forEach((metric: any) => {
      const dateKey = metric.date;
      const existing = dateMap.get(dateKey) || { dateKey };
      
      if (metric.hrv !== undefined) existing.hrv = metric.hrv;
      if (metric.deepSleepPct !== undefined) existing.deepSleepPct = metric.deepSleepPct;
      if (metric.sleepDuration !== undefined) existing.sleepDuration = metric.sleepDuration;
      if (metric.restingHeartRate !== undefined) existing.restingHeartRate = metric.restingHeartRate;
      
      dateMap.set(dateKey, existing);
    });
    
    // Sort by date, filter to days with data
    const sortedDays = Array.from(dateMap.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());
    
    // FROZEN BASELINE: Calculate once and persist via ref
    // This ensures the control chart reference never shifts when late-arriving data syncs
    const startDateStr = supplementStartDate;
    const objectiveKeys = ['hrv', 'deepSleepPct', 'sleepDuration', 'restingHeartRate'];
    const subjectiveKeys = ['sleep_quality', 'recovery', 'stress_level'];
    
    // Calculate baseline statistics for each metric
    const calculateBaselineStats = (days: Record<string, any>[], key: string) => {
      const values = days.map(d => d[key]).filter((v): v is number => v !== undefined);
      if (values.length === 0) return null;
      
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      
      if (values.length < 2) {
        return { mean, stdDev: 1 }; // Guard: single point uses stdDev=1
      }
      
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance) || 1;
      return { mean, stdDev };
    };
    
    // Use frozen baseline if already computed for THIS experiment's start date
    // Keyed by both experiment ID and start date to prevent cross-experiment leakage
    const experimentId = experimentData?.experiment?.id;
    let objectiveBaselines: Record<string, { mean: number; stdDev: number } | null>;
    let subjectiveBaselines: Record<string, { mean: number; stdDev: number } | null>;
    
    const isFrozenForThisExperiment = startDateStr && experimentId &&
      frozenBaselineRef.current?.frozenForExperimentId === experimentId &&
      frozenBaselineRef.current?.frozenForStartDate === startDateStr;
    
    if (isFrozenForThisExperiment) {
      // USE FROZEN BASELINE - never recompute for this experiment
      objectiveBaselines = frozenBaselineRef.current!.objectiveBaselines;
      subjectiveBaselines = frozenBaselineRef.current!.subjectiveBaselines;
    } else {
      // COMPUTE BASELINE (will be frozen on first computation when startDate exists)
      let baselineDays: Record<string, any>[];
      
      if (startDateStr) {
        // Get days before supplement started
        const preStartDays = sortedDays
          .filter(([dateKey]) => dateKey < startDateStr)
          .map(([, data]) => data);
        
        if (preStartDays.length >= 2) {
          baselineDays = preStartDays;
        } else {
          // Fallback: use first 7 days overall
          baselineDays = sortedDays.slice(0, Math.min(7, sortedDays.length)).map(([, data]) => data);
        }
      } else {
        // No start date yet (baseline phase), use first 7 days
        baselineDays = sortedDays.slice(0, Math.min(7, sortedDays.length)).map(([, data]) => data);
      }
      
      // Compute baseline stats
      objectiveBaselines = {};
      objectiveKeys.forEach(key => {
        objectiveBaselines[key] = calculateBaselineStats(baselineDays, key);
      });
      
      subjectiveBaselines = {};
      subjectiveKeys.forEach(key => {
        subjectiveBaselines[key] = calculateBaselineStats(baselineDays, key);
      });
      
      // FREEZE the baseline once supplement has started for this experiment
      if (startDateStr && experimentId) {
        frozenBaselineRef.current = {
          objectiveBaselines,
          subjectiveBaselines,
          frozenForExperimentId: experimentId,
          frozenForStartDate: startDateStr,
        };
      }
    }
    
    // Build chart data with composite Z-scores
    const result: Record<string, any>[] = [];
    
    sortedDays.forEach(([dateKey, data], index) => {
      // Parse date as local (not UTC) by appending T12:00:00 to avoid timezone shift
      // Without this, "2024-12-11" becomes midnight UTC which is Dec 10 in PST
      const date = new Date(dateKey + 'T12:00:00');
      const isAfterStart = startDateStr && dateKey >= startDateStr;
      
      // Calculate Z-score for each available metric
      const calculateZScore = (value: number | undefined, key: string, baselines: Record<string, { mean: number; stdDev: number } | null>) => {
        if (value === undefined) return null;
        const baseline = baselines[key];
        if (!baseline) return null;
        const polarity = METRIC_POLARITIES[key as keyof typeof METRIC_POLARITIES] || 1;
        return ((value - baseline.mean) / baseline.stdDev) * polarity;
      };
      
      // Calculate objective composite Z-score
      const objectiveZScores: number[] = [];
      objectiveKeys.forEach(key => {
        const z = calculateZScore(data[key], key, objectiveBaselines);
        if (z !== null) objectiveZScores.push(z);
      });
      const objectiveComposite = objectiveZScores.length > 0
        ? objectiveZScores.reduce((a, b) => a + b, 0) / objectiveZScores.length
        : undefined;
      
      // Calculate subjective composite Z-score
      const subjectiveZScores: number[] = [];
      subjectiveKeys.forEach(key => {
        const z = calculateZScore(data[key], key, subjectiveBaselines);
        if (z !== null) subjectiveZScores.push(z);
      });
      const subjectiveComposite = subjectiveZScores.length > 0
        ? subjectiveZScores.reduce((a, b) => a + b, 0) / subjectiveZScores.length
        : undefined;
      
      // Only include days ON OR AFTER the experiment start date (or all if no start date yet)
      // This ensures the chart only shows experiment period data, not baseline period
      const shouldInclude = !startDateStr || dateKey >= startDateStr;
      
      if (shouldInclude && (objectiveComposite !== undefined || subjectiveComposite !== undefined)) {
        result.push({
          day: result.length + 1, // Day number relative to experiment start
          dateKey,
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          objectiveComposite: objectiveComposite !== undefined ? Math.max(-3, Math.min(3, objectiveComposite)) : undefined,
          subjectiveComposite: subjectiveComposite !== undefined ? Math.max(-3, Math.min(3, subjectiveComposite)) : undefined,
          isStartDate: dateKey === startDateStr,
          isAfterStart,
        });
      }
    });
    
    return result;
  }, [checkins, objectiveMetrics, supplementStartDate, METRIC_POLARITIES, experimentData]);
  
  // Calculate AI analysis trends from composite Z-scores
  const aiAnalysis = useMemo(() => {
    if (!chartData.length || chartData.length < 3) return null;
    
    const analysis: { improved: Array<{ name: string; change: number }>; noChange: Array<{ name: string }>; declined: Array<{ name: string; change: number }> } = {
      improved: [],
      noChange: [],
      declined: [],
    };
    
    // Analyze objective composite (Biometrics)
    const objectiveValues = chartData.map(d => d.objectiveComposite).filter((v): v is number => v !== undefined);
    if (objectiveValues.length >= 3) {
      const recentAvg = objectiveValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
      // Positive Z-score = improvement (above baseline)
      if (recentAvg > 0.5) {
        analysis.improved.push({ name: 'Biometrics', change: recentAvg * 33 }); // Approx % improvement
      } else if (recentAvg < -0.5) {
        analysis.declined.push({ name: 'Biometrics', change: recentAvg * 33 });
      } else {
        analysis.noChange.push({ name: 'Biometrics' });
      }
    }
    
    // Analyze subjective composite (How You Feel)
    const subjectiveValues = chartData.map(d => d.subjectiveComposite).filter((v): v is number => v !== undefined);
    if (subjectiveValues.length >= 3) {
      const recentAvg = subjectiveValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
      if (recentAvg > 0.5) {
        analysis.improved.push({ name: 'How You Feel', change: recentAvg * 33 });
      } else if (recentAvg < -0.5) {
        analysis.declined.push({ name: 'How You Feel', change: recentAvg * 33 });
      } else {
        analysis.noChange.push({ name: 'How You Feel' });
      }
    }
    
    return analysis;
  }, [chartData]);


  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-cyan-400 rounded-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-red-400">Failed to load assessment</p>
        <p className="text-white/40 text-sm text-center">{(error as any)?.message || 'Unknown error'}</p>
        <Button
          variant="outline"
          className="border-white/20 text-white"
          onClick={() => setLocation('/actions')}
        >
          Go Back
        </Button>
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

  // Custom tooltip for Z-score deviation chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      const formatZScore = (value: number | undefined) => {
        if (value === undefined) return 'N/A';
        const sign = value >= 0 ? '+' : '';
        return `${sign}${value.toFixed(2)} σ`;
      };
      
      return (
        <div className="backdrop-blur-xl rounded-lg border p-3 shadow-lg bg-slate-900/95 border-white/20">
          <p className="text-xs mb-2 text-white/60">{data?.date}</p>
          {data?.objectiveComposite !== undefined && (
            <p className="text-sm">
              <span className="font-medium text-[#00E5FF]">Biometrics:</span>{' '}
              <span className={data.objectiveComposite >= 0 ? 'text-green-400' : 'text-orange-400'}>
                {formatZScore(data.objectiveComposite)}
              </span>
            </p>
          )}
          {data?.subjectiveComposite !== undefined && (
            <p className="text-sm">
              <span className="font-medium text-[#FF9100]">How You Feel:</span>{' '}
              <span className={data.subjectiveComposite >= 0 ? 'text-green-400' : 'text-orange-400'}>
                {formatZScore(data.subjectiveComposite)}
              </span>
            </p>
          )}
          {data?.isStartDate && (
            <p className="text-xs text-green-400 mt-1">← Supplement started</p>
          )}
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

        {/* Z-SCORE DEVIATION PLOT (Control Chart) */}
        {(experiment.status === 'baseline' || experiment.status === 'active' || experiment.status === 'completed') && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">{supplementConfig?.name || 'Supplement'} Impact</h3>
                <p className="text-xs text-white/60">
                  {experiment.status === 'baseline' 
                    ? 'Collecting baseline data before supplement starts' 
                    : 'Deviation from your normal (Up = Better)'}
                </p>
              </div>
            </div>
            
            {chartData.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center">
                <BarChart3 className="w-10 h-10 text-white/20 mb-3" />
                <p className="text-white/60 text-sm">No data recorded yet</p>
                <p className="text-white/40 text-xs mt-1">
                  {experiment.status === 'baseline' 
                    ? 'Complete your first check-in to start tracking'
                    : 'Need at least 2 days of baseline data to calculate deviations'}
                </p>
              </div>
            ) : (
              <>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 15, left: 5, bottom: 5 }}>
                      <XAxis 
                        dataKey="date" 
                        stroke="#ffffff40" 
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      {/* Single Y-axis: Z-score from -3 to +3 */}
                      <YAxis 
                        domain={[-3, 3]} 
                        stroke="#ffffff40" 
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        width={70}
                        ticks={[-3, -1.5, 0, 1.5, 3]}
                        tickFormatter={(value) => {
                          if (value === 3) return 'Much Better';
                          if (value === 1.5) return 'Better';
                          if (value === 0) return 'Normal';
                          if (value === -1.5) return 'Worse';
                          if (value === -3) return 'Much Worse';
                          return value.toString();
                        }}
                      />
                      
                      {/* Center reference line at 0 = "Normal" baseline */}
                      <ReferenceLine 
                        y={0} 
                        stroke="#ffffff50" 
                        strokeDasharray="8 4" 
                        strokeWidth={2}
                        label={{ 
                          value: 'Baseline', 
                          position: 'right', 
                          fill: '#ffffff60', 
                          fontSize: 10 
                        }}
                      />
                      
                      {/* Vertical marker at supplement start date */}
                      {chartData.some(d => d.isStartDate) && (
                        <ReferenceLine 
                          x={chartData.find(d => d.isStartDate)?.date}
                          stroke="#22c55e" 
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={{ 
                            value: 'Started', 
                            position: 'top', 
                            fill: '#22c55e', 
                            fontSize: 10 
                          }}
                        />
                      )}
                      
                      <Tooltip content={<CustomTooltip />} />
                      
                      {/* Objective Composite Line - Cyan Solid */}
                      {chartData.some(d => d.objectiveComposite !== undefined) && (
                        <Line
                          type="monotone"
                          dataKey="objectiveComposite"
                          stroke="#00E5FF"
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#00E5FF', strokeWidth: 0 }}
                          activeDot={{ r: 6, strokeWidth: 2, fill: '#00E5FF' }}
                          name="Biometrics (HealthKit)"
                          connectNulls
                        />
                      )}
                      
                      {/* Subjective Composite Line - Orange Dashed */}
                      {chartData.some(d => d.subjectiveComposite !== undefined) && (
                        <Line
                          type="monotone"
                          dataKey="subjectiveComposite"
                          stroke="#FF9100"
                          strokeWidth={3}
                          strokeDasharray="8 4"
                          dot={{ r: 4, fill: '#FF9100', strokeWidth: 0 }}
                          activeDot={{ r: 6, strokeWidth: 2, fill: '#FF9100' }}
                          name="How You Feel"
                          connectNulls
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Legend - matching the JSON spec */}
                <div className="mt-4 pt-3 border-t border-white/10">
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Objective line legend */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[#00E5FF]" />
                      <span className="text-xs text-[#00E5FF]">Biometrics (HealthKit)</span>
                    </div>
                    
                    {/* Subjective line legend */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 border-t-2 border-dashed border-[#FF9100]" />
                      <span className="text-xs text-[#FF9100]">How You Feel</span>
                    </div>
                    
                    {/* Baseline legend */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 border-t-2 border-dashed border-white/50" />
                      <span className="text-xs text-white/50">Your Normal</span>
                    </div>
                  </div>
                  
                  <p className="text-[10px] text-white/30 mt-3">
                    Z-score normalized: Up always means improvement. Chart shows deviation from your baseline average.
                  </p>
                </div>
              </>
            )}
          </Card>
        )}

        {/* AI Analysis Section */}
        {aiAnalysis && (aiAnalysis.improved.length > 0 || aiAnalysis.noChange.length > 0 || aiAnalysis.declined.length > 0) && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">AI Analysis</h3>
                <p className="text-xs text-white/60">Early trend detection</p>
              </div>
            </div>
            
            <div className="space-y-3">
              {/* Improved Metrics */}
              {aiAnalysis.improved.length > 0 && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Improved</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aiAnalysis.improved.map((item) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <span className="text-sm text-white/80">{item.name}</span>
                        <span className="text-xs text-green-400">+{item.change.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Change Metrics */}
              {aiAnalysis.noChange.length > 0 && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Minus className="w-4 h-4 text-white/60" />
                    <span className="text-sm font-medium text-white/60">No Change</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aiAnalysis.noChange.map((item) => (
                      <span key={item.name} className="text-sm text-white/60">{item.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Declined Metrics */}
              {aiAnalysis.declined.length > 0 && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium text-orange-400">Declined</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aiAnalysis.declined.map((item) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <span className="text-sm text-white/80">{item.name}</span>
                        <span className="text-xs text-orange-400">{item.change.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-white/40 mt-3">
              Analysis based on first half vs. second half comparison. More data = more accurate.
            </p>
          </Card>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="p-6 bg-slate-900 border-white/20 max-w-sm w-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Delete Assessment?</h3>
                  <p className="text-sm text-white/60">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-white/70 text-sm mb-6">
                Are you sure you want to delete this assessment? All progress and check-in data will be lost.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                  onClick={() => setShowDeleteConfirm(false)}
                  data-testid="button-cancel-delete"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-500 hover:bg-red-600"
                  onClick={() => deleteAssessmentMutation.mutate()}
                  disabled={deleteAssessmentMutation.isPending}
                  data-testid="button-confirm-delete"
                >
                  {deleteAssessmentMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </Card>
          </div>
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
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500"
                onClick={() => startAssessmentMutation.mutate()}
                disabled={startAssessmentMutation.isPending}
                data-testid="button-start-assessment"
              >
                {startAssessmentMutation.isPending ? 'Starting...' : 'Start Assessment'}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="button-delete-pending"
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            </div>
          </Card>
        )}

        {/* Assessment Controls (for active/paused assessments) */}
        {(experiment.status === 'active' || experiment.status === 'paused') && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <FlaskConical className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Assessment Controls</h3>
                  <p className="text-xs text-white/60">Manage your assessment</p>
                </div>
              </div>
              <div className="flex gap-2">
                {experiment.status === 'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                    onClick={() => updateStatusMutation.mutate('paused')}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-pause-assessment"
                  >
                    <Pause className="w-4 h-4 mr-1" />
                    Pause
                  </Button>
                )}
                {experiment.status === 'paused' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                    onClick={() => updateStatusMutation.mutate('active')}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-resume-assessment"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Resume
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="button-delete-active"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
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

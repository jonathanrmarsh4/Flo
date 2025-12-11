import { useState, useMemo, useCallback } from "react";
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

interface MetricConfig {
  key: string;
  name: string;
  color: string;
  type: 'subjective' | 'objective';
  yAxisId: 'left' | 'right';
  unit?: string;
}

export default function AssessmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [checkinRatings, setCheckinRatings] = useState<Record<string, number>>({});
  const [checkinNotes, setCheckinNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [highlightedMetric, setHighlightedMetric] = useState<string | null>(null);

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

  // Define metric configurations from SUPPLEMENT CONFIGURATION (not from data)
  const metricConfigs = useMemo((): MetricConfig[] => {
    const configs: MetricConfig[] = [];
    
    // Get supplement config from experiment data if available
    const suppTypeId = experimentData?.experiment?.supplement_type_id;
    const suppConfig = suppTypeId ? SUPPLEMENT_CONFIGURATIONS[suppTypeId] : null;
    
    // Subjective colors: purple, cyan, green (matching reference)
    const subjectiveColors = ['#a855f7', '#22d3ee', '#22c55e', '#f97316', '#eab308', '#14b8a6'];
    // Objective colors: pink/magenta, orange, indigo, teal (matching reference)
    const objectiveColors = ['#ec4899', '#f97316', '#6366f1', '#14b8a6'];
    
    // Use supplement configuration to define expected metrics
    if (suppConfig) {
      // Add ALL subjective metrics from config
      suppConfig.subjectiveMetrics.forEach((metric, index) => {
        const key = metric.metric.toLowerCase().replace(/\s+/g, '_');
        configs.push({
          key,
          name: metric.metric,
          color: subjectiveColors[index % subjectiveColors.length],
          type: 'subjective',
          yAxisId: 'left',
          unit: '/10',
        });
      });
      
      // Add ALL objective metrics from config
      suppConfig.objectiveMetrics.forEach((metric, index) => {
        // Map metric name to chart data key
        let key = 'hrv';
        let unit = 'ms';
        const metricName = metric.metric.toLowerCase();
        
        if (metricName.includes('hrv')) {
          key = 'hrv';
          unit = 'ms';
        } else if (metricName.includes('deep sleep')) {
          key = 'deepSleepPct';
          unit = '%';
        } else if (metricName.includes('rem sleep')) {
          key = 'remSleepPct';
          unit = '%';
        } else if (metricName.includes('sleep duration')) {
          key = 'sleepDuration';
          unit = 'min';
        } else if (metricName.includes('resting') && metricName.includes('heart')) {
          key = 'restingHeartRate';
          unit = 'bpm';
        } else if (metricName.includes('sleep efficiency')) {
          key = 'sleepEfficiency';
          unit = '%';
        } else if (metricName.includes('weight')) {
          key = 'weight';
          unit = 'kg';
        } else if (metricName.includes('active energy')) {
          key = 'activeEnergy';
          unit = 'kcal';
        }
        
        configs.push({
          key,
          name: metric.metric,
          color: objectiveColors[index % objectiveColors.length],
          type: 'objective',
          yAxisId: 'right',
          unit,
        });
      });
    }
    
    return configs;
  }, [experimentData]);

  // Helper to calculate rolling average (trendline)
  const calculateTrendline = useCallback((data: number[], windowSize: number = 3): number[] => {
    if (data.length === 0) return [];
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = data.slice(start, i + 1);
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      result.push(avg);
    }
    return result;
  }, []);

  // Generate PROGRESSIVE chart data - only days with actual data
  const chartData = useMemo(() => {
    if (!checkins.length && !objectiveMetrics.length) return [];
    
    // Create a map of dates to data points - ONLY for days with actual data
    const dateMap = new Map<string, Record<string, any>>();
    
    // Add subjective check-in data with normalized keys
    checkins.forEach((checkin) => {
      const dateKey = checkin.checkin_date.split('T')[0];
      const existing = dateMap.get(dateKey) || { dateKey, hasSubjective: false };
      
      if (checkin.ratings && Object.keys(checkin.ratings).length > 0) {
        existing.hasSubjective = true;
        Object.entries(checkin.ratings).forEach(([key, value]) => {
          // Normalize key to match supplement config format
          const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
          existing[normalizedKey] = value;
        });
      }
      
      dateMap.set(dateKey, existing);
    });
    
    // Add ALL objective HealthKit data (cast to any to allow additional properties)
    objectiveMetrics.forEach((metric: any) => {
      const dateKey = metric.date;
      const existing = dateMap.get(dateKey) || { dateKey, hasObjective: false };
      
      let hasAnyObjective = false;
      if (metric.hrv !== undefined) { existing.hrv = metric.hrv; hasAnyObjective = true; }
      if (metric.deepSleepPct !== undefined) { existing.deepSleepPct = metric.deepSleepPct; hasAnyObjective = true; }
      if (metric.remSleepPct !== undefined) { existing.remSleepPct = metric.remSleepPct; hasAnyObjective = true; }
      if (metric.sleepDuration !== undefined) { existing.sleepDuration = metric.sleepDuration; hasAnyObjective = true; }
      if (metric.restingHeartRate !== undefined) { existing.restingHeartRate = metric.restingHeartRate; hasAnyObjective = true; }
      if (metric.sleepEfficiency !== undefined) { existing.sleepEfficiency = metric.sleepEfficiency; hasAnyObjective = true; }
      if (metric.weight !== undefined) { existing.weight = metric.weight; hasAnyObjective = true; }
      if (metric.activeEnergy !== undefined) { existing.activeEnergy = metric.activeEnergy; hasAnyObjective = true; }
      
      if (hasAnyObjective) existing.hasObjective = true;
      
      dateMap.set(dateKey, existing);
    });
    
    // Sort by date - ONLY include days that have at least some data
    const sortedData: Record<string, any>[] = Array.from(dateMap.entries())
      .filter(([, data]) => data.hasSubjective || data.hasObjective)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([dateKey, data], index) => {
        const date = new Date(dateKey);
        return {
          ...data,
          day: index + 1,
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        };
      });
    
    // Calculate PROGRESSIVE baseline trendlines (cumulative rolling average)
    if (sortedData.length >= 1) {
      const subjectiveKeys = metricConfigs.filter(m => m.type === 'subjective').map(m => m.key);
      const objectiveKeys = metricConfigs.filter(m => m.type === 'objective').map(m => m.key);
      
      // Progressive subjective baseline - grows as data arrives
      let subjectiveRunningSum = 0;
      let subjectiveRunningCount = 0;
      sortedData.forEach((d) => {
        if (d.hasSubjective) {
          const values = subjectiveKeys.map(k => d[k]).filter((v): v is number => v !== undefined);
          if (values.length > 0) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            subjectiveRunningSum += avg;
            subjectiveRunningCount++;
          }
        }
        // Only add baseline point if we have ANY subjective data so far
        if (subjectiveRunningCount > 0) {
          d.subjectiveBaseline = subjectiveRunningSum / subjectiveRunningCount;
        }
      });
      
      // Progressive objective baseline - normalize all objective metrics to 0-100 scale for comparison
      let objectiveRunningSum = 0;
      let objectiveRunningCount = 0;
      sortedData.forEach((d) => {
        if (d.hasObjective) {
          // Collect all objective values and normalize to 0-100 scale
          const normalizedValues: number[] = [];
          objectiveKeys.forEach((k) => {
            const val = d[k];
            if (val !== undefined) {
              // Normalize based on expected ranges
              let normalized = val;
              if (k === 'hrv') normalized = Math.min(100, (val / 150) * 100); // HRV 0-150ms -> 0-100
              else if (k === 'deepSleepPct' || k === 'remSleepPct' || k === 'sleepEfficiency') normalized = val; // Already %
              else if (k === 'restingHeartRate') normalized = Math.max(0, 100 - ((val - 40) / 60) * 100); // RHR 40-100bpm -> 100-0 (lower is better)
              else if (k === 'sleepDuration') normalized = Math.min(100, (val / 480) * 100); // 0-8hr -> 0-100
              normalizedValues.push(normalized);
            }
          });
          if (normalizedValues.length > 0) {
            const avg = normalizedValues.reduce((a, b) => a + b, 0) / normalizedValues.length;
            objectiveRunningSum += avg;
            objectiveRunningCount++;
          }
        }
        // Only add baseline point if we have ANY objective data so far
        if (objectiveRunningCount > 0) {
          d.objectiveBaseline = objectiveRunningSum / objectiveRunningCount;
        }
      });
    }
    
    return sortedData;
  }, [checkins, objectiveMetrics, metricConfigs]);
  
  // Calculate baseline averages for reference lines
  const baselineAverages = useMemo(() => {
    if (chartData.length < 2) return null;
    
    const subjectiveKeys = metricConfigs.filter(m => m.type === 'subjective').map(m => m.key);
    const objectiveKeys = metricConfigs.filter(m => m.type === 'objective').map(m => m.key);
    
    // Use first 7 days (or available data) as baseline
    const baselineWindow = chartData.slice(0, Math.min(7, Math.floor(chartData.length / 2)));
    
    // Calculate subjective baseline (0-10 scale)
    let subjectiveBaseline: number | null = null;
    if (subjectiveKeys.length > 0 && baselineWindow.length > 0) {
      const allValues: number[] = [];
      baselineWindow.forEach(d => {
        subjectiveKeys.forEach(k => {
          if (d[k] !== undefined) allValues.push(d[k] as number);
        });
      });
      if (allValues.length > 0) {
        subjectiveBaseline = allValues.reduce((a, b) => a + b, 0) / allValues.length;
      }
    }
    
    // Calculate objective baseline (use HRV as primary)
    let objectiveBaseline: number | null = null;
    if (objectiveKeys.length > 0 && baselineWindow.length > 0) {
      const hrvValues = baselineWindow.map(d => d.hrv).filter((v): v is number => v !== undefined);
      if (hrvValues.length > 0) {
        objectiveBaseline = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
      }
    }
    
    return { subjectiveBaseline, objectiveBaseline };
  }, [chartData, metricConfigs]);

  // Calculate AI analysis trends for the metrics
  const aiAnalysis = useMemo(() => {
    if (!chartData.length || chartData.length < 3) return null;
    
    const analysis: { improved: Array<{ name: string; change: number }>; noChange: Array<{ name: string }>; declined: Array<{ name: string; change: number }> } = {
      improved: [],
      noChange: [],
      declined: [],
    };
    
    metricConfigs.forEach((metric) => {
      const values = chartData.map(d => (d as Record<string, unknown>)[metric.key] as number | undefined).filter((v): v is number => v !== undefined);
      if (values.length < 3) return;
      
      // Compare first half vs second half average
      const midpoint = Math.floor(values.length / 2);
      const firstHalf = values.slice(0, midpoint);
      const secondHalf = values.slice(midpoint);
      
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;
      
      // For metrics where higher is better
      if (Math.abs(changePercent) < 5) {
        analysis.noChange.push({ name: metric.name });
      } else if (changePercent > 0) {
        analysis.improved.push({ name: metric.name, change: changePercent });
      } else {
        analysis.declined.push({ name: metric.name, change: changePercent });
      }
    });
    
    return analysis;
  }, [chartData, metricConfigs]);

  // Handle metric click to highlight
  const handleMetricClick = useCallback((key: string) => {
    setHighlightedMetric(prev => prev === key ? null : key);
  }, []);

  // Get metric names from check-in ratings for chart legend - MUST be before any early returns
  const chartMetricNames = useMemo(() => {
    if (!checkins.length || !checkins[0]?.ratings) return [];
    return Object.keys(checkins[0].ratings);
  }, [checkins]);

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

        {/* Enhanced Metrics Trend Chart with Dual Y-Axes */}
        {(experiment.status === 'baseline' || experiment.status === 'active' || experiment.status === 'completed') && (
          <Card className="p-4 bg-white/5 border-white/10 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Metrics Trend</h3>
                <p className="text-xs text-white/60">
                  {experiment.status === 'baseline' 
                    ? 'Collecting baseline data before supplement starts' 
                    : 'Subjective (1-10) + Objective HealthKit data'}
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
                    : 'Your progress chart will appear after your first check-in'}
                </p>
              </div>
            ) : (
              <>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <XAxis 
                        dataKey="day" 
                        stroke="#ffffff40" 
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      {/* Left Y-axis for subjective metrics (1-10 scale) */}
                      <YAxis 
                        yAxisId="left"
                        domain={[0, 10]} 
                        stroke="#22d3ee" 
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        width={25}
                        label={{ value: '1-10', angle: -90, position: 'insideLeft', fill: '#22d3ee', fontSize: 9, offset: 10 }}
                      />
                      {/* Right Y-axis for objective metrics (variable scale) */}
                      {metricConfigs.some(m => m.type === 'objective') && (
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          domain={['auto', 'auto']} 
                          stroke="#ec4899" 
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          width={35}
                          label={{ value: 'Objective', angle: 90, position: 'insideRight', fill: '#ec4899', fontSize: 9, offset: 10 }}
                        />
                      )}
                      <Tooltip content={<CustomTooltip />} />
                      
                      {/* Progressive GREY baseline trendlines - these grow as data arrives */}
                      {chartData.some(d => d.subjectiveBaseline !== undefined) && (
                        <Line
                          type="monotone"
                          dataKey="subjectiveBaseline"
                          yAxisId="left"
                          stroke="#888888"
                          strokeWidth={3}
                          strokeOpacity={0.4}
                          strokeDasharray="8 4"
                          dot={{ r: 4, fill: '#888888', strokeWidth: 0, fillOpacity: 0.5 }}
                          name="Subjective Baseline"
                          connectNulls
                          legendType="none"
                        />
                      )}
                      
                      {chartData.some(d => d.objectiveBaseline !== undefined) && (
                        <Line
                          type="monotone"
                          dataKey="objectiveBaseline"
                          yAxisId="right"
                          stroke="#888888"
                          strokeWidth={3}
                          strokeOpacity={0.4}
                          strokeDasharray="8 4"
                          dot={{ r: 4, fill: '#888888', strokeWidth: 0, fillOpacity: 0.5 }}
                          name="Objective Baseline"
                          connectNulls
                          legendType="none"
                        />
                      )}
                      
                      {/* Individual metric lines - deviate from baselines */}
                      {metricConfigs.map((metric) => (
                        <Line
                          key={metric.key}
                          type="monotone"
                          dataKey={metric.key}
                          yAxisId={metric.yAxisId}
                          stroke={metric.color}
                          strokeWidth={highlightedMetric === null || highlightedMetric === metric.key ? 2 : 1}
                          strokeOpacity={highlightedMetric === null || highlightedMetric === metric.key ? 1 : 0.25}
                          dot={{ r: 3, fill: metric.color, strokeWidth: 0 }}
                          activeDot={{ r: 5, strokeWidth: 2, fill: metric.color }}
                          name={metric.name}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Legend - matching reference design format */}
                <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                  {/* Baseline trendline legend */}
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-0.5 border-t-2 border-dashed border-gray-500" />
                      <span className="text-[10px] text-white/40">Baseline trendlines (grow as data arrives)</span>
                    </div>
                  </div>
                  
                  {/* Subjective Metrics Row */}
                  {metricConfigs.filter(m => m.type === 'subjective').length > 0 && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-white/60 font-medium">Subjective:</span>
                      {metricConfigs.filter(m => m.type === 'subjective').map((metric) => (
                        <button
                          key={metric.key}
                          onClick={() => handleMetricClick(metric.key)}
                          className={`flex items-center gap-1.5 text-xs transition-all ${
                            highlightedMetric === null || highlightedMetric === metric.key
                              ? 'opacity-100'
                              : 'opacity-40'
                          }`}
                          data-testid={`button-metric-${metric.key}`}
                        >
                          <div className="w-4 h-0.5" style={{ backgroundColor: metric.color }} />
                          <span style={{ color: metric.color }}>{metric.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Objective Metrics Row */}
                  {metricConfigs.filter(m => m.type === 'objective').length > 0 && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-white/60 font-medium">Objective:</span>
                      {metricConfigs.filter(m => m.type === 'objective').map((metric) => (
                        <button
                          key={metric.key}
                          onClick={() => handleMetricClick(metric.key)}
                          className={`flex items-center gap-1.5 text-xs transition-all ${
                            highlightedMetric === null || highlightedMetric === metric.key
                              ? 'opacity-100'
                              : 'opacity-40'
                          }`}
                          data-testid={`button-metric-${metric.key}`}
                        >
                          <div className="w-4 h-0.5" style={{ backgroundColor: metric.color }} />
                          <span style={{ color: metric.color }}>{metric.name}</span>
                          {metric.unit && <span style={{ color: metric.color }} className="opacity-70">({metric.unit})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-[10px] text-white/30 mt-2">
                    Chart builds progressively as check-ins and HealthKit data arrive
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

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sliders, RotateCcw, Save, Activity, Brain, Bell, TrendingUp, History, Target, Gauge, ChevronDown, ChevronUp, AlertCircle, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

interface MLSettings {
  anomalyZScoreThreshold: number;
  anomalyMinConfidence: number;
  minPatternMatches: number;
  historyWindowMonths: number;
  minPositiveOccurrences: number;
  positiveOutcomeThreshold: number;
  insightConfidenceThreshold: number;
  maxCausesToShow: number;
  maxPositivePatternsToShow: number;
  enableProactiveAlerts: boolean;
  alertCooldownHours: number;
}

interface MetricSensitivity {
  id: string;
  metricType: string;
  enabled: boolean;
  zScoreThreshold: number;
  percentageThreshold: number;
  notifyOnAnomaly: boolean;
  notifyOnImprovement: boolean;
  cooldownHours: number;
  suppressedByEvents: string[];
}

const METRIC_DISPLAY_NAMES: Record<string, string> = {
  water_intake: 'Water Intake',
  steps: 'Steps',
  active_energy: 'Active Calories',
  exercise_minutes: 'Exercise Minutes',
  hrv_ms: 'Heart Rate Variability',
  resting_heart_rate_bpm: 'Resting Heart Rate',
  sleep_duration_min: 'Sleep Duration',
  deep_sleep_min: 'Deep Sleep',
  rem_sleep_min: 'REM Sleep',
  respiratory_rate_bpm: 'Respiratory Rate',
  oxygen_saturation_pct: 'Blood Oxygen',
  body_temperature_deviation: 'Body Temperature',
};

const EVENT_TYPES = [
  'travel', 'illness', 'stress', 'injury', 'rest_day', 'alcohol',
  'equipment_unavailable', 'social_event', 'caffeine', 'jet_lag',
  'menstrual_cycle', 'altitude', 'fasting', 'medication_change'
];

export function AdminMLSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [settings, setSettings] = useState<MLSettings>({
    anomalyZScoreThreshold: 2.0,
    anomalyMinConfidence: 0.5,
    minPatternMatches: 3,
    historyWindowMonths: 24,
    minPositiveOccurrences: 5,
    positiveOutcomeThreshold: 0.1,
    insightConfidenceThreshold: 0.3,
    maxCausesToShow: 3,
    maxPositivePatternsToShow: 3,
    enableProactiveAlerts: true,
    alertCooldownHours: 4,
  });
  
  const [hasChanges, setHasChanges] = useState(false);

  const { data: serverSettings, isLoading } = useQuery<MLSettings>({
    queryKey: ['/api/admin/ml-settings'],
  });

  useEffect(() => {
    if (serverSettings) {
      setSettings(serverSettings);
      setHasChanges(false);
    }
  }, [serverSettings]);

  const updateSetting = <K extends keyof MLSettings>(key: K, value: MLSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<MLSettings>) => {
      return apiRequest('PATCH', '/api/admin/ml-settings', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ml-settings'] });
      toast({ title: 'Settings Saved', description: 'ML sensitivity settings updated successfully.' });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to save settings', variant: 'destructive' });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/ml-settings/reset');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ml-settings'] });
      toast({ title: 'Settings Reset', description: 'ML sensitivity settings restored to defaults.' });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to reset settings', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
        <div className="flex items-center gap-2 text-white/50">
          <Activity className="w-5 h-5 animate-spin" />
          <span>Loading ML settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white/5 border-white/10 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-purple-400" />
            ML Sensitivity Settings
          </h4>
          <p className="text-xs text-white/50 mt-1">
            Fine-tune the causality engine thresholds and pattern detection sensitivity
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs transition-all disabled:opacity-50"
            data-testid="button-reset-ml-settings"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={() => saveMutation.mutate(settings)}
            disabled={saveMutation.isPending || !hasChanges}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-xs transition-all disabled:opacity-50"
            data-testid="button-save-ml-settings"
          >
            {saveMutation.isPending ? (
              <Activity className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <Target className="w-4 h-4 text-red-400" />
            Anomaly Detection
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-white/60">Z-Score Threshold</Label>
              <span className="text-xs text-white/80 font-mono">{settings.anomalyZScoreThreshold.toFixed(1)}</span>
            </div>
            <Slider
              value={[settings.anomalyZScoreThreshold]}
              onValueChange={([val]) => updateSetting('anomalyZScoreThreshold', val)}
              min={0.5}
              max={5}
              step={0.1}
              className="w-full"
              data-testid="slider-z-score"
            />
            <p className="text-[10px] text-white/40">
              Lower = more sensitive (more alerts). Higher = only major deviations. Default: 2.0
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-white/60">Min Confidence</Label>
              <span className="text-xs text-white/80 font-mono">{Math.round(settings.anomalyMinConfidence * 100)}%</span>
            </div>
            <Slider
              value={[settings.anomalyMinConfidence]}
              onValueChange={([val]) => updateSetting('anomalyMinConfidence', val)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
              data-testid="slider-min-confidence"
            />
            <p className="text-[10px] text-white/40">
              Minimum confidence to surface an anomaly. Higher = fewer but more certain alerts.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <History className="w-4 h-4 text-blue-400" />
            Pattern Matching
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-white/60">Min Pattern Matches</Label>
              <span className="text-xs text-white/80 font-mono">{settings.minPatternMatches}</span>
            </div>
            <Slider
              value={[settings.minPatternMatches]}
              onValueChange={([val]) => updateSetting('minPatternMatches', Math.round(val))}
              min={1}
              max={20}
              step={1}
              className="w-full"
              data-testid="slider-min-pattern-matches"
            />
            <p className="text-[10px] text-white/40">
              How many times a pattern must occur before it's "recurring". Higher = stronger evidence.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-white/60">History Window</Label>
              <span className="text-xs text-white/80 font-mono">{settings.historyWindowMonths} months</span>
            </div>
            <Slider
              value={[settings.historyWindowMonths]}
              onValueChange={([val]) => updateSetting('historyWindowMonths', Math.round(val))}
              min={1}
              max={120}
              step={1}
              className="w-full"
              data-testid="slider-history-window"
            />
            <p className="text-[10px] text-white/40">
              How far back to search for patterns. Longer = more data but slower. Max 10 years.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <TrendingUp className="w-4 h-4 text-green-400" />
            Positive Patterns
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-white/60">Min Positive Occurrences</Label>
              <span className="text-xs text-white/80 font-mono">{settings.minPositiveOccurrences}</span>
            </div>
            <Slider
              value={[settings.minPositiveOccurrences]}
              onValueChange={([val]) => updateSetting('minPositiveOccurrences', Math.round(val))}
              min={2}
              max={20}
              step={1}
              className="w-full"
              data-testid="slider-min-positive-occurrences"
            />
            <p className="text-[10px] text-white/40">
              Minimum times a behavior must precede good outcomes to flag as "what's working".
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-white/60">Outcome Improvement Threshold</Label>
              <span className="text-xs text-white/80 font-mono">{Math.round(settings.positiveOutcomeThreshold * 100)}%</span>
            </div>
            <Slider
              value={[settings.positiveOutcomeThreshold]}
              onValueChange={([val]) => updateSetting('positiveOutcomeThreshold', val)}
              min={0.05}
              max={0.5}
              step={0.01}
              className="w-full"
              data-testid="slider-positive-outcome-threshold"
            />
            <p className="text-[10px] text-white/40">
              Minimum improvement in outcomes to consider a pattern "positive".
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <Brain className="w-4 h-4 text-purple-400" />
            Insight Generation
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-white/60">Insight Confidence Threshold</Label>
              <span className="text-xs text-white/80 font-mono">{Math.round(settings.insightConfidenceThreshold * 100)}%</span>
            </div>
            <Slider
              value={[settings.insightConfidenceThreshold]}
              onValueChange={([val]) => updateSetting('insightConfidenceThreshold', val)}
              min={0.1}
              max={0.9}
              step={0.05}
              className="w-full"
              data-testid="slider-insight-confidence-threshold"
            />
            <p className="text-[10px] text-white/40">
              Minimum confidence to generate a smart insight. Higher = fewer but higher quality.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-white/60">Max Causes</Label>
              <input
                type="number"
                value={settings.maxCausesToShow}
                onChange={(e) => updateSetting('maxCausesToShow', Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-full px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-purple-500"
                min={1}
                max={10}
                data-testid="input-max-causes"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-white/60">Max Positive Patterns</Label>
              <input
                type="number"
                value={settings.maxPositivePatternsToShow}
                onChange={(e) => updateSetting('maxPositivePatternsToShow', Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-full px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-purple-500"
                min={1}
                max={10}
                data-testid="input-max-positive-patterns"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center gap-2 text-white/80 text-sm font-medium mb-4">
          <Bell className="w-4 h-4 text-yellow-400" />
          Notification Controls
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs text-white/60">Enable Proactive Alerts</Label>
              <p className="text-[10px] text-white/40 mt-0.5">Send push notifications for detected anomalies</p>
            </div>
            <Switch
              checked={settings.enableProactiveAlerts}
              onCheckedChange={(checked) => updateSetting('enableProactiveAlerts', checked)}
              data-testid="switch-enable-proactive-alerts"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-white/60">Alert Cooldown</Label>
              <span className="text-xs text-white/80 font-mono">{settings.alertCooldownHours}h</span>
            </div>
            <Slider
              value={[settings.alertCooldownHours]}
              onValueChange={([val]) => updateSetting('alertCooldownHours', Math.round(val))}
              min={1}
              max={24}
              step={1}
              className="w-full"
              data-testid="slider-alert-cooldown"
            />
            <p className="text-[10px] text-white/40">
              Minimum hours between alerts for same metric type
            </p>
          </div>
        </div>
      </div>

      <PerMetricSensitivitySection />
    </div>
  );
}

function PerMetricSensitivitySection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editedSettings, setEditedSettings] = useState<Record<string, Partial<MetricSensitivity>>>({});
  const [savingMetric, setSavingMetric] = useState<string | null>(null);

  const { data: metricSettings, isLoading } = useQuery<MetricSensitivity[]>({
    queryKey: ['/api/admin/metric-sensitivity'],
  });

  const updateMetricMutation = useMutation({
    mutationFn: async ({ metricType, updates }: { metricType: string; updates: Partial<MetricSensitivity> }) => {
      setSavingMetric(metricType);
      return apiRequest('PATCH', `/api/admin/metric-sensitivity/${metricType}`, updates);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/metric-sensitivity'] });
      toast({ title: 'Saved', description: 'Per-metric sensitivity updated.' });
      // Only clear edits for the metric that was saved
      setEditedSettings(prev => {
        const newState = { ...prev };
        delete newState[variables.metricType];
        return newState;
      });
      setSavingMetric(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update', variant: 'destructive' });
      setSavingMetric(null);
    },
  });

  const getEditedValue = <K extends keyof MetricSensitivity>(metricType: string, key: K, original: MetricSensitivity[K]): MetricSensitivity[K] => {
    return (editedSettings[metricType]?.[key] ?? original) as MetricSensitivity[K];
  };

  const updateEditedValue = (metricType: string, key: keyof MetricSensitivity, value: any) => {
    setEditedSettings(prev => ({
      ...prev,
      [metricType]: { ...prev[metricType], [key]: value }
    }));
  };

  const handleSave = (metric: MetricSensitivity) => {
    if (editedSettings[metric.metricType]) {
      updateMetricMutation.mutate({
        metricType: metric.metricType,
        updates: editedSettings[metric.metricType]
      });
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="border-t border-white/10 pt-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <Gauge className="w-4 h-4 text-cyan-400" />
            Per-Metric Sensitivity Controls
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-4">
          <p className="text-[10px] text-white/40 mb-4">
            Fine-tune sensitivity for each metric type. Life events can automatically suppress alerts for specific metrics.
          </p>
          
          <div className="space-y-3">
            {(metricSettings || []).map((metric) => (
              <div
                key={metric.metricType}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={getEditedValue(metric.metricType, 'enabled', metric.enabled)}
                      onCheckedChange={(checked) => {
                        updateEditedValue(metric.metricType, 'enabled', checked);
                      }}
                      data-testid={`switch-metric-${metric.metricType}`}
                    />
                    <span className="text-sm text-white font-medium">
                      {METRIC_DISPLAY_NAMES[metric.metricType] || metric.metricType}
                    </span>
                  </div>
                  
                  {editedSettings[metric.metricType] && Object.keys(editedSettings[metric.metricType]).length > 0 && (
                    <button
                      onClick={() => handleSave(metric)}
                      disabled={updateMetricMutation.isPending}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs"
                      data-testid={`button-save-metric-${metric.metricType}`}
                    >
                      <Save className="w-3 h-3" />
                      Save
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <Label className="text-[10px] text-white/50">Z-Score</Label>
                    <input
                      type="number"
                      value={getEditedValue(metric.metricType, 'zScoreThreshold', metric.zScoreThreshold)}
                      onChange={(e) => {
                        updateEditedValue(metric.metricType, 'zScoreThreshold', parseFloat(e.target.value) || 2.0);
                      }}
                      step={0.1}
                      min={0.5}
                      max={5}
                      className="w-full mt-1 px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs focus:outline-none focus:border-cyan-500"
                      data-testid={`input-zscore-${metric.metricType}`}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-[10px] text-white/50">% Threshold</Label>
                    <input
                      type="number"
                      value={getEditedValue(metric.metricType, 'percentageThreshold', metric.percentageThreshold)}
                      onChange={(e) => {
                        updateEditedValue(metric.metricType, 'percentageThreshold', parseFloat(e.target.value) || 15);
                      }}
                      step={1}
                      min={1}
                      max={100}
                      className="w-full mt-1 px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs focus:outline-none focus:border-cyan-500"
                      data-testid={`input-pct-${metric.metricType}`}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-[10px] text-white/50">Cooldown (hrs)</Label>
                    <input
                      type="number"
                      value={getEditedValue(metric.metricType, 'cooldownHours', metric.cooldownHours)}
                      onChange={(e) => {
                        updateEditedValue(metric.metricType, 'cooldownHours', parseInt(e.target.value) || 4);
                      }}
                      step={1}
                      min={1}
                      max={72}
                      className="w-full mt-1 px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs focus:outline-none focus:border-cyan-500"
                      data-testid={`input-cooldown-${metric.metricType}`}
                    />
                  </div>
                  
                  <div className="flex items-center gap-3 pt-4">
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={getEditedValue(metric.metricType, 'notifyOnAnomaly', metric.notifyOnAnomaly)}
                        onCheckedChange={(checked) => {
                          updateEditedValue(metric.metricType, 'notifyOnAnomaly', checked);
                        }}
                        className="scale-75"
                        data-testid={`switch-notify-${metric.metricType}`}
                      />
                      <span className="text-[10px] text-white/50">Notify</span>
                    </div>
                  </div>
                </div>

                {metric.suppressedByEvents.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] text-white/50">Suppressed by life events:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {metric.suppressedByEvents.map((event) => (
                        <Badge
                          key={event}
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-amber-500/30 text-amber-400/80"
                        >
                          {event.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {(!metricSettings || metricSettings.length === 0) && (
            <SeedDefaultsSection onSeeded={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/metric-sensitivity'] })} />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SeedDefaultsSection({ onSeeded }: { onSeeded: () => void }) {
  const { toast } = useToast();
  
  const seedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/metric-sensitivity/seed', {});
    },
    onSuccess: (data: any) => {
      toast({ 
        title: 'Defaults Seeded', 
        description: `Created ${data.inserted} metric sensitivity settings.` 
      });
      onSeeded();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to seed defaults', 
        variant: 'destructive' 
      });
    },
  });

  return (
    <div className="text-center py-8 text-white/40 text-sm">
      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p>No per-metric settings found.</p>
      <p className="text-[10px] mt-2 mb-4">Seed the default sensitivity settings for 12 key health metrics.</p>
      <button
        onClick={() => seedMutation.mutate()}
        disabled={seedMutation.isPending}
        className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium disabled:opacity-50"
        data-testid="button-seed-metric-defaults"
      >
        {seedMutation.isPending ? 'Seeding...' : 'Seed Default Settings'}
      </button>
    </div>
  );
}

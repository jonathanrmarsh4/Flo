import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Moon, 
  ChevronLeft, 
  Play, 
  Square, 
  Clock, 
  Plus, 
  Calendar,
  Sparkles,
  Trash2,
  Edit3,
  History,
  Pencil,
  X
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface ManualSleepEntry {
  id: string;
  sleep_date: string;
  bedtime: string | null;
  wake_time: string | null;
  duration_minutes: number;
  quality_rating: number;
  nightflo_score: number;
  score_label: string;
  notes: string | null;
  is_timer_active: boolean;
  timer_started_at: string | null;
  source?: 'manual' | 'healthkit';
}

interface ActiveTimer {
  active: boolean;
  started_at: string | null;
  elapsed_minutes: number;
}

export default function SleepLogger() {
  const [isDark] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ManualSleepEntry | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'manual') {
      setShowManualEntry(true);
    }
  }, []);

  const { data: entries = [], isLoading } = useQuery<ManualSleepEntry[]>({
    queryKey: ['/api/sleep/manual'],
    refetchInterval: 10000,
  });

  const { data: timerStatus } = useQuery<ActiveTimer>({
    queryKey: ['/api/sleep/manual/timer/status'],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (timerStatus?.active && timerStatus.started_at) {
      const startTime = new Date(timerStatus.started_at).getTime();
      const updateTimer = () => {
        const now = Date.now();
        const diffMs = now - startTime;
        setElapsedTime(Math.floor(diffMs / 1000));
      };
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [timerStatus?.active, timerStatus?.started_at]);

  const startTimerMutation = useMutation({
    mutationFn: async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await apiRequest('POST', '/api/sleep/manual/timer/start', { timezone });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sleep/manual/timer/status'] });
      toast({ title: 'Sleep timer started', description: 'Tracking your sleep now. Stop when you wake up.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: async (qualityRating: number) => {
      const res = await apiRequest('POST', '/api/sleep/manual/timer/stop', { quality_rating: qualityRating });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sleep/manual'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sleep/manual/timer/status'] });
      toast({ 
        title: 'Sleep logged!', 
        description: data.message || 'Your sleep has been recorded.' 
      });
      setShowStopDialog(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: async (data: { 
      sleep_date: string; 
      bedtime?: string; 
      wake_time?: string; 
      duration_minutes: number; 
      quality_rating: number; 
      notes?: string 
    }) => {
      const res = await apiRequest('POST', '/api/sleep/manual', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sleep/manual'] });
      toast({ title: 'Sleep entry saved' });
      setShowManualEntry(false);
      setEditingEntry(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ManualSleepEntry> }) => {
      const res = await apiRequest('PATCH', `/api/sleep/manual/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sleep/manual'] });
      toast({ title: 'Entry updated' });
      setEditingEntry(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/sleep/manual/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sleep/manual'] });
      toast({ title: 'Entry deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const [showStopDialog, setShowStopDialog] = useState(false);
  const [stopQuality, setStopQuality] = useState(3);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().split('T')[0]) return 'Today';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return isDark ? 'text-green-400' : 'text-green-600';
    if (score >= 60) return isDark ? 'text-blue-400' : 'text-blue-600';
    if (score >= 40) return isDark ? 'text-amber-400' : 'text-amber-600';
    return isDark ? 'text-red-400' : 'text-red-600';
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              className={isDark ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-gray-100'}
              data-testid="button-back"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Sleep Tracker
              </h1>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Manual sleep logging
              </p>
            </div>
          </div>
          <button 
            onClick={() => setLocation('/')}
            className={`p-2 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            data-testid="button-close"
          >
            <X className={`w-5 h-5 ${isDark ? 'text-white/60' : 'text-gray-500'}`} />
          </button>
        </div>

        <Button
          onClick={() => timerStatus?.active ? setShowStopDialog(true) : startTimerMutation.mutate()}
          disabled={startTimerMutation.isPending}
          className="w-full mb-6 h-12 bg-purple-600 hover:bg-purple-700 text-white rounded-xl"
          data-testid="button-start-timer"
        >
          {timerStatus?.active ? (
            <>
              <Square className="w-4 h-4 mr-2" />
              Stop Sleep Tracking ({formatElapsed(elapsedTime)})
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Sleep Tracking
            </>
          )}
        </Button>

        <Card className={`p-4 mb-6 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Manual Entry
            </span>
            <button
              onClick={() => setShowManualEntry(true)}
              className={`p-1.5 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            >
              <Pencil className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
            </button>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowManualEntry(true)}
            className={`w-full mt-3 ${isDark ? 'border-white/20 text-white/70 hover:bg-white/5' : ''}`}
            data-testid="button-manual-entry"
          >
            Log sleep manually
          </Button>
        </Card>

        <div className="mb-4 flex items-center gap-2">
          <History className={`w-5 h-5 ${isDark ? 'text-white/60' : 'text-gray-500'}`} />
          <h2 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Sleep History
          </h2>
        </div>

        {isLoading ? (
          <div className={`text-center py-8 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
            Loading...
          </div>
        ) : entries.filter(e => e.source === 'manual').length === 0 ? (
          <Card className={`p-6 text-center ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
            <Moon className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-white/30' : 'text-gray-300'}`} />
            <p className={`${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              No manual sleep entries yet. Start tracking your sleep!
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.filter(e => e.source === 'manual').map((entry) => {
              const qualityLabels = ['', 'Poor', 'Restless', 'Fair', 'Good', 'Refreshed'];
              const qualityLabel = qualityLabels[entry.quality_rating] || 'Fair';
              const qualityColors: Record<string, string> = {
                'Poor': isDark ? 'text-red-400' : 'text-red-600',
                'Restless': isDark ? 'text-orange-400' : 'text-orange-600',
                'Fair': isDark ? 'text-amber-400' : 'text-amber-600',
                'Good': isDark ? 'text-green-400' : 'text-green-600',
                'Refreshed': isDark ? 'text-green-400' : 'text-green-600',
              };
              
              const formatTimeRange = (bedtime: string | null, wakeTime: string | null) => {
                if (!bedtime || !wakeTime) return null;
                try {
                  const bed = new Date(bedtime);
                  const wake = new Date(wakeTime);
                  const bedStr = bed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  const wakeStr = wake.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  return `${bedStr} - ${wakeStr}`;
                } catch {
                  return null;
                }
              };
              
              return (
                <Card 
                  key={entry.id}
                  className={`p-4 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}
                  data-testid={`card-sleep-entry-${entry.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {formatDate(entry.sleep_date)}
                      </span>
                      {formatTimeRange(entry.bedtime, entry.wake_time) && (
                        <p className={`text-xs mt-0.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {formatTimeRange(entry.bedtime, entry.wake_time)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${getScoreColor(entry.nightflo_score)}`}>
                          {entry.nightflo_score}
                        </span>
                        <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>score</p>
                      </div>
                      {(entry.source === 'manual' || !entry.source) && (
                        <button
                          onClick={() => setEditingEntry(entry)}
                          className={`p-1.5 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                          data-testid={`button-edit-${entry.id}`}
                        >
                          <Pencil className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-3">
                    <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>Duration</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {formatDuration(entry.duration_minutes)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Sparkles className={`w-3.5 h-3.5 ${qualityColors[qualityLabel] || 'text-green-400'}`} />
                    <span className={`text-xs font-medium ${qualityColors[qualityLabel] || 'text-green-400'}`}>
                      {qualityLabel}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent className={isDark ? 'bg-gray-900 border-white/10 text-white' : ''}>
          <DialogHeader>
            <DialogTitle>Rate Your Sleep</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              How did you sleep? ({formatDuration(Math.floor(elapsedTime / 60))})
            </p>
            <div className="flex justify-center gap-2">
              {[
                { value: 1, label: 'Poor' },
                { value: 2, label: 'Restless' },
                { value: 3, label: 'Fair' },
                { value: 4, label: 'Good' },
                { value: 5, label: 'Refresh' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setStopQuality(value)}
                  className={`flex flex-col items-center justify-center w-14 h-16 rounded-lg border transition-all ${
                    value === stopQuality
                      ? isDark 
                        ? 'bg-green-500/20 border-green-500 text-green-400' 
                        : 'bg-green-100 border-green-500 text-green-700'
                      : isDark 
                        ? 'border-white/20 text-white/60 hover:border-white/40' 
                        : 'border-gray-300 text-gray-500 hover:border-gray-400'
                  }`}
                  data-testid={`button-quality-${value}`}
                >
                  <span className="text-lg font-semibold">{value}</span>
                  <span className="text-[10px] mt-0.5">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStopDialog(false)}
              className={isDark ? 'border-white/20' : ''}
            >
              Cancel
            </Button>
            <Button
              onClick={() => stopTimerMutation.mutate(stopQuality)}
              disabled={stopTimerMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Save Sleep
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManualEntryDialog
        isDark={isDark}
        open={showManualEntry || !!editingEntry}
        onOpenChange={(open) => {
          if (!open) {
            setShowManualEntry(false);
            setEditingEntry(null);
          }
        }}
        entry={editingEntry}
        onSave={(data) => {
          if (editingEntry) {
            updateEntryMutation.mutate({ id: editingEntry.id, data });
          } else {
            createEntryMutation.mutate(data as any);
          }
        }}
        isPending={createEntryMutation.isPending || updateEntryMutation.isPending}
      />
    </div>
  );
}

interface ManualEntryDialogProps {
  isDark: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ManualSleepEntry | null;
  onSave: (data: {
    sleep_date: string;
    bedtime?: string;
    wake_time?: string;
    duration_minutes: number;
    quality_rating: number;
    notes?: string;
  }) => void;
  isPending: boolean;
}

function ManualEntryDialog({ isDark, open, onOpenChange, entry, onSave, isPending }: ManualEntryDialogProps) {
  const [sleepDate, setSleepDate] = useState('');
  const [bedtime, setBedtime] = useState('');
  const [wakeTime, setWakeTime] = useState('');
  const [hours, setHours] = useState('7');
  const [minutes, setMinutes] = useState('30');
  const [quality, setQuality] = useState(3);
  const [notes, setNotes] = useState('');
  const [minutesAwake, setMinutesAwake] = useState('0');
  const [useTimePickers, setUseTimePickers] = useState(false);

  useEffect(() => {
    if (entry) {
      setSleepDate(entry.sleep_date);
      setBedtime(entry.bedtime ? new Date(entry.bedtime).toTimeString().slice(0, 5) : '');
      setWakeTime(entry.wake_time ? new Date(entry.wake_time).toTimeString().slice(0, 5) : '');
      setHours(Math.floor(entry.duration_minutes / 60).toString());
      setMinutes((entry.duration_minutes % 60).toString());
      setQuality(entry.quality_rating);
      setNotes(entry.notes || '');
      setMinutesAwake('0');
      setUseTimePickers(!!entry.bedtime || !!entry.wake_time);
    } else {
      const today = new Date().toISOString().split('T')[0];
      setSleepDate(today);
      setBedtime('22:00');
      setWakeTime('06:30');
      setHours('7');
      setMinutes('30');
      setQuality(3);
      setNotes('');
      setMinutesAwake('0');
      setUseTimePickers(true);
    }
  }, [entry, open]);

  const handleSave = () => {
    if (!bedtime || !wakeTime) return;

    const bedtimeDate = new Date(`${sleepDate}T${bedtime}:00`);
    const waketimeDate = new Date(`${sleepDate}T${wakeTime}:00`);
    if (waketimeDate <= bedtimeDate) {
      waketimeDate.setDate(waketimeDate.getDate() + 1);
    }
    
    const totalMinutes = Math.floor((waketimeDate.getTime() - bedtimeDate.getTime()) / (1000 * 60));
    const awakeMinutes = parseInt(minutesAwake) || 0;
    const sleepMinutes = Math.max(totalMinutes - awakeMinutes, 1);
    
    if (sleepMinutes < 1 || sleepMinutes > 1440) {
      return;
    }

    const data: any = {
      sleep_date: sleepDate,
      duration_minutes: sleepMinutes,
      quality_rating: quality,
      notes: notes || undefined,
      bedtime: bedtimeDate.toISOString(),
      wake_time: waketimeDate.toISOString(),
    };

    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isDark ? 'bg-gray-900 border-white/10 text-white' : ''} max-w-md`}>
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit Sleep Session' : 'Log Sleep Manually'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label className={isDark ? 'text-white/80' : ''}>Date</Label>
            <Input
              type="date"
              value={sleepDate}
              onChange={(e) => setSleepDate(e.target.value)}
              className={isDark ? 'bg-white/5 border-white/20 text-white' : ''}
              data-testid="input-sleep-date"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={`rounded-xl p-4 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <Label className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-500'}`}>Bedtime</Label>
              </div>
              <Input
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                className={`text-lg font-medium border-0 p-0 h-auto ${isDark ? 'bg-transparent text-white' : 'bg-transparent text-gray-900'}`}
                data-testid="input-bedtime"
              />
            </div>
            <div className={`rounded-xl p-4 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <Label className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-500'}`}>Wake time</Label>
              </div>
              <Input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className={`text-lg font-medium border-0 p-0 h-auto ${isDark ? 'bg-transparent text-white' : 'bg-transparent text-gray-900'}`}
                data-testid="input-waketime"
              />
            </div>
          </div>

          <div>
            <Label className={isDark ? 'text-white/80' : ''}>Minutes awake during night</Label>
            <Input
              type="number"
              min="0"
              max="480"
              value={minutesAwake}
              onChange={(e) => setMinutesAwake(e.target.value)}
              className={`mt-2 ${isDark ? 'bg-white/5 border-white/20 text-white' : ''}`}
              data-testid="input-minutes-awake"
            />
          </div>

          <div>
            <Label className={isDark ? 'text-white/80' : ''}>How did you sleep?</Label>
            <div className="flex justify-center gap-2 mt-3">
              {[
                { value: 1, label: 'Poor' },
                { value: 2, label: 'Restless' },
                { value: 3, label: 'Fair' },
                { value: 4, label: 'Good' },
                { value: 5, label: 'Refresh' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setQuality(value)}
                  className={`flex flex-col items-center justify-center w-14 h-16 rounded-lg border transition-all ${
                    value === quality
                      ? isDark 
                        ? 'bg-green-500/20 border-green-500 text-green-400' 
                        : 'bg-green-100 border-green-500 text-green-700'
                      : isDark 
                        ? 'border-white/20 text-white/60 hover:border-white/40' 
                        : 'border-gray-300 text-gray-500 hover:border-gray-400'
                  }`}
                  data-testid={`button-quality-${value}`}
                >
                  <span className="text-lg font-semibold">{value}</span>
                  <span className="text-[10px] mt-0.5">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className={isDark ? 'text-white/80' : ''}>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did you feel? Any factors that affected your sleep?"
              className={`resize-none ${isDark ? 'bg-white/5 border-white/20 text-white placeholder:text-white/30' : ''}`}
              rows={2}
              data-testid="input-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={isDark ? 'border-white/20' : ''}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-save-entry"
          >
            {isPending ? 'Saving...' : entry ? 'Update Session' : 'Save Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

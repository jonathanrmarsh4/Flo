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
  Star,
  Trash2,
  Edit3,
  History
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
      const res = await apiRequest('POST', '/api/sleep/manual/timer/start');
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
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            className={isDark ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-gray-100'}
            data-testid="button-back"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <Moon className={`w-6 h-6 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          <h1 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Sleep Logger
          </h1>
        </div>

        <Card className={`p-6 mb-6 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
          <div className="text-center">
            {timerStatus?.active ? (
              <>
                <div className={`text-xs mb-2 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                  Sleep Timer Running
                </div>
                <div className={`text-5xl font-mono mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-timer">
                  {formatElapsed(elapsedTime)}
                </div>
                <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                  Started at {timerStatus.started_at ? new Date(timerStatus.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--'}
                </p>
                <Button
                  onClick={() => setShowStopDialog(true)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  data-testid="button-stop-timer"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop & Log Sleep
                </Button>
              </>
            ) : (
              <>
                <div className={`p-4 rounded-full inline-block mb-4 ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                  <Clock className={`w-10 h-10 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <h2 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Track Your Sleep
                </h2>
                <p className={`text-sm mb-6 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                  Start the timer when you go to bed, stop it when you wake up.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => startTimerMutation.mutate()}
                    disabled={startTimerMutation.isPending}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                    data-testid="button-start-timer"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Sleep Timer
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowManualEntry(true)}
                    className={`flex-1 ${isDark ? 'border-white/20 text-white hover:bg-white/5' : ''}`}
                    data-testid="button-manual-entry"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Log Manually
                  </Button>
                </div>
              </>
            )}
          </div>
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
        ) : entries.length === 0 ? (
          <Card className={`p-6 text-center ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
            <Moon className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-white/30' : 'text-gray-300'}`} />
            <p className={`${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              No sleep entries yet. Start tracking your sleep!
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <Card 
                key={entry.id}
                className={`p-4 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}
                data-testid={`card-sleep-entry-${entry.id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
                    <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {formatDate(entry.sleep_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-lg font-semibold ${getScoreColor(entry.nightflo_score)}`}>
                      {entry.nightflo_score}
                    </span>
                    <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      / 100
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    {formatDuration(entry.duration_minutes)} sleep
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= entry.quality_rating
                            ? isDark ? 'text-yellow-400 fill-yellow-400' : 'text-yellow-500 fill-yellow-500'
                            : isDark ? 'text-white/20' : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {entry.notes && (
                  <p className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {entry.notes}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingEntry(entry)}
                    className={`${isDark ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-700'}`}
                    data-testid={`button-edit-${entry.id}`}
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Delete this sleep entry?')) {
                        deleteEntryMutation.mutate(entry.id);
                      }
                    }}
                    className={`${isDark ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' : 'text-red-500 hover:text-red-700'}`}
                    data-testid={`button-delete-${entry.id}`}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
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
              How well did you sleep? ({formatDuration(Math.floor(elapsedTime / 60))})
            </p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  onClick={() => setStopQuality(rating)}
                  className={`p-2 rounded-full transition-all ${
                    rating <= stopQuality
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : isDark ? 'text-white/30 hover:text-white/50' : 'text-gray-300 hover:text-gray-400'
                  }`}
                  data-testid={`button-quality-${rating}`}
                >
                  <Star className={`w-8 h-8 ${rating <= stopQuality ? 'fill-yellow-400' : ''}`} />
                </button>
              ))}
            </div>
            <div className="text-center mt-2">
              <span className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                {['', 'Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'][stopQuality]}
              </span>
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
      setUseTimePickers(false);
    }
  }, [entry, open]);

  const handleSave = () => {
    const durationMins = parseInt(hours) * 60 + parseInt(minutes);
    if (durationMins < 1 || durationMins > 1440) {
      return;
    }

    const data: any = {
      sleep_date: sleepDate,
      duration_minutes: durationMins,
      quality_rating: quality,
      notes: notes || undefined,
    };

    if (useTimePickers && bedtime && wakeTime) {
      const bedtimeDate = new Date(`${sleepDate}T${bedtime}:00`);
      const waketimeDate = new Date(`${sleepDate}T${wakeTime}:00`);
      if (waketimeDate <= bedtimeDate) {
        waketimeDate.setDate(waketimeDate.getDate() + 1);
      }
      data.bedtime = bedtimeDate.toISOString();
      data.wake_time = waketimeDate.toISOString();
    }

    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isDark ? 'bg-gray-900 border-white/10 text-white' : ''} max-w-md`}>
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit Sleep Entry' : 'Log Sleep Manually'}</DialogTitle>
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

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useTimePickers"
              checked={useTimePickers}
              onChange={(e) => setUseTimePickers(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="useTimePickers" className={isDark ? 'text-white/80' : ''}>
              Set specific bed/wake times
            </Label>
          </div>

          {useTimePickers ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className={isDark ? 'text-white/80' : ''}>Bedtime</Label>
                <Input
                  type="time"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className={isDark ? 'bg-white/5 border-white/20 text-white' : ''}
                  data-testid="input-bedtime"
                />
              </div>
              <div>
                <Label className={isDark ? 'text-white/80' : ''}>Wake Time</Label>
                <Input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className={isDark ? 'bg-white/5 border-white/20 text-white' : ''}
                  data-testid="input-waketime"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label className={isDark ? 'text-white/80' : ''}>Sleep Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className={`w-20 ${isDark ? 'bg-white/5 border-white/20 text-white' : ''}`}
                  data-testid="input-hours"
                />
                <span className={isDark ? 'text-white/60' : 'text-gray-500'}>hours</span>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className={`w-20 ${isDark ? 'bg-white/5 border-white/20 text-white' : ''}`}
                  data-testid="input-minutes"
                />
                <span className={isDark ? 'text-white/60' : 'text-gray-500'}>min</span>
              </div>
            </div>
          )}

          <div>
            <Label className={isDark ? 'text-white/80' : ''}>Sleep Quality</Label>
            <div className="flex justify-center gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  onClick={() => setQuality(rating)}
                  className={`p-2 rounded-full transition-all ${
                    rating <= quality
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : isDark ? 'text-white/30 hover:text-white/50' : 'text-gray-300 hover:text-gray-400'
                  }`}
                  data-testid={`button-quality-${rating}`}
                >
                  <Star className={`w-6 h-6 ${rating <= quality ? 'fill-yellow-400' : ''}`} />
                </button>
              ))}
            </div>
            <div className="text-center mt-1">
              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                {['', 'Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'][quality]}
              </span>
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
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="button-save-entry"
          >
            {isPending ? 'Saving...' : 'Save Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

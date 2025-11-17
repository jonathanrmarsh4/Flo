import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import {
  getNotificationConfig,
  saveNotificationConfig,
  initializeFlomentumNotifications,
  type FlomentumNotificationConfig
} from '@/lib/flomentumNotifications';
import { Bell, Clock, TrendingUp, Calendar } from 'lucide-react';

export function FlomentumNotificationSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<FlomentumNotificationConfig>(getNotificationConfig());
  const [isSaving, setIsSaving] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const loadedConfig = getNotificationConfig();
    setConfig(loadedConfig);
  }, []);

  const handleToggle = (key: keyof FlomentumNotificationConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTimeChange = (key: 'dailyScoreTime' | 'syncReminderTime', value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Save to localStorage
      saveNotificationConfig(config);

      // Re-initialize notifications with new config
      if (isNative) {
        await initializeFlomentumNotifications(config);
      }

      toast({
        title: 'Settings Saved',
        description: 'Your notification preferences have been updated',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save notification settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isNative) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Notifications are only available on the mobile app
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Flōmentum Notifications
        </CardTitle>
        <CardDescription>
          Manage your health momentum notifications and reminders
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Daily Score Notification */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="daily-score">Daily Flōmentum Score</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when your daily score is ready
                </p>
              </div>
            </div>
            <Switch
              id="daily-score"
              checked={config.dailyScoreEnabled}
              onCheckedChange={() => handleToggle('dailyScoreEnabled')}
              data-testid="toggle-daily-score"
            />
          </div>
          
          {config.dailyScoreEnabled && (
            <div className="ml-7 space-y-2">
              <Label htmlFor="daily-time" className="text-sm text-muted-foreground">
                Notification Time
              </Label>
              <Input
                id="daily-time"
                type="time"
                value={config.dailyScoreTime}
                onChange={(e) => handleTimeChange('dailyScoreTime', e.target.value)}
                className="w-32"
                data-testid="input-daily-score-time"
              />
            </div>
          )}
        </div>

        {/* Weekly Summary Notification */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label htmlFor="weekly-summary">Weekly Summary</Label>
              <p className="text-sm text-muted-foreground">
                Receive your weekly Flōmentum insights every Monday
              </p>
            </div>
          </div>
          <Switch
            id="weekly-summary"
            checked={config.weeklySummaryEnabled}
            onCheckedChange={() => handleToggle('weeklySummaryEnabled')}
            data-testid="toggle-weekly-summary"
          />
        </div>

        {/* Sync Reminder */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="sync-reminder">Daily Sync Reminder</Label>
                <p className="text-sm text-muted-foreground">
                  Reminder to sync your HealthKit data
                </p>
              </div>
            </div>
            <Switch
              id="sync-reminder"
              checked={config.syncReminderEnabled}
              onCheckedChange={() => handleToggle('syncReminderEnabled')}
              data-testid="toggle-sync-reminder"
            />
          </div>
          
          {config.syncReminderEnabled && (
            <div className="ml-7 space-y-2">
              <Label htmlFor="reminder-time" className="text-sm text-muted-foreground">
                Reminder Time
              </Label>
              <Input
                id="reminder-time"
                type="time"
                value={config.syncReminderTime}
                onChange={(e) => handleTimeChange('syncReminderTime', e.target.value)}
                className="w-32"
                data-testid="input-sync-reminder-time"
              />
            </div>
          )}
        </div>

        {/* Action Reminders */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div>
              <Label htmlFor="action-reminders" className="font-medium">Daily Action Reminders</Label>
              <p className="text-sm text-muted-foreground">
                Morning check-in, midday movement, evening wind-down
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Helps you take action toward your milestones
              </p>
            </div>
          </div>
          <Switch
            id="action-reminders"
            checked={config.actionRemindersEnabled}
            onCheckedChange={() => handleToggle('actionRemindersEnabled')}
            data-testid="toggle-action-reminders"
          />
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
          data-testid="button-save-notification-settings"
        >
          {isSaving ? 'Saving...' : 'Save Notification Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}

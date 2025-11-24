import { Bell, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { User as UserType } from '@shared/schema';
import { useUpdateReminderPreferences } from '@/hooks/useProfile';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ReminderSettingsProps {
  user: UserType;
  isEditing: boolean;
  isDark?: boolean;
}

// Common timezones for quick selection
const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/Denver', label: 'Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Australia/Perth', label: 'Perth' },
];

export function ReminderSettings({ user, isEditing, isDark = false }: ReminderSettingsProps) {
  const { toast } = useToast();
  const updateReminders = useUpdateReminderPreferences();
  
  // Normalize null/undefined values to safe defaults (match database defaults)
  const normalizeTime = (time: string | null) => time || '08:15';
  const normalizeTimezone = (tz: string | null) => tz || 'UTC';
  
  const [localEnabled, setLocalEnabled] = useState(user.reminderEnabled);
  const [localTime, setLocalTime] = useState(normalizeTime(user.reminderTime));
  const [localTimezone, setLocalTimezone] = useState(normalizeTimezone(user.reminderTimezone));

  // Sync local state when user prop changes (e.g., after successful mutation or external updates)
  useEffect(() => {
    setLocalEnabled(user.reminderEnabled);
    setLocalTime(normalizeTime(user.reminderTime));
    setLocalTimezone(normalizeTimezone(user.reminderTimezone));
  }, [user.reminderEnabled, user.reminderTime, user.reminderTimezone]);

  const handleSave = () => {
    updateReminders.mutate(
      {
        reminderEnabled: localEnabled,
        reminderTime: localTime,
        reminderTimezone: localTimezone,
      },
      {
        onSuccess: () => {
          toast({
            title: "Reminder Preferences Updated",
            description: "Your daily reminder settings have been saved.",
          });
        },
        onError: (error: any) => {
          toast({
            title: "Update Failed",
            description: error.message || "Failed to update reminder preferences",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bell className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
        <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Daily Health Reminders</span>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Enabled</span>
        {isEditing ? (
          <Button
            data-testid="toggle-reminders"
            size="sm"
            variant={localEnabled ? "default" : "outline"}
            onClick={() => setLocalEnabled(!localEnabled)}
          >
            {localEnabled ? "On" : "Off"}
          </Button>
        ) : (
          <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{user.reminderEnabled ? "On" : "Off"}</span>
        )}
      </div>

      {/* Reminder Time */}
      <div className="flex items-center justify-between">
        <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'} flex items-center gap-1.5`}>
          <Clock className="w-3.5 h-3.5" />
          Time
        </span>
        {isEditing ? (
          <Input
            data-testid="input-reminder-time"
            type="time"
            value={localTime}
            onChange={(e) => setLocalTime(e.target.value)}
            className="w-32 h-8 text-sm"
          />
        ) : (
          <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{user.reminderTime}</span>
        )}
      </div>

      {/* Timezone */}
      <div className="flex items-center justify-between">
        <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Timezone</span>
        {isEditing ? (
          <Select value={localTimezone} onValueChange={setLocalTimezone}>
            <SelectTrigger data-testid="select-timezone" className="w-48 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>{user.reminderTimezone}</span>
        )}
      </div>

      {/* Save Button (only shown when editing and values changed) */}
      {isEditing && (
        localEnabled !== user.reminderEnabled ||
        localTime !== user.reminderTime ||
        localTimezone !== user.reminderTimezone
      ) && (
        <Button
          data-testid="button-save-reminders"
          onClick={handleSave}
          disabled={updateReminders.isPending}
          className="w-full h-8 text-sm"
        >
          {updateReminders.isPending ? "Saving..." : "Save Reminder Settings"}
        </Button>
      )}
    </div>
  );
}

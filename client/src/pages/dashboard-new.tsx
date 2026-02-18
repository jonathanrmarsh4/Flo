import { useState } from 'react';
import { Moon, Sun, LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence } from 'framer-motion';
import { DashboardScreen } from '@/components/DashboardScreen';
import { DashboardErrorBoundary } from '@/components/DashboardErrorBoundary';
import { BottomNav } from '@/components/BottomNav';
import { VoiceChatScreen } from '@/components/VoiceChatScreen';
import { useAuth } from '@/hooks/useAuth';
import { useHealthKitAutoPermission } from '@/hooks/useHealthKitAutoPermission';
import { useTheme } from '@/components/theme-provider';
import { queryClient } from '@/lib/queryClient';
import { logger } from '@/lib/logger';

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const [isVoiceChatOpen, setIsVoiceChatOpen] = useState(false);
  const [voiceChatContext, setVoiceChatContext] = useState<string | undefined>(undefined);

  const handleTalkToFlo = (context?: string) => {
    setVoiceChatContext(context);
    setIsVoiceChatOpen(true);
  };

  // Automatically request HealthKit permissions on iOS app launch
  useHealthKitAutoPermission();

  const handleLogout = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
        await SecureStoragePlugin.remove({ key: 'auth_token' });
        logger.debug('JWT token cleared from secure storage on logout');
      } catch (error) {
        logger.error('Failed to clear auth token on logout');
      }
      
      // Clear HealthKit sync plugin auth token to prevent stale token issues
      try {
        const { HealthSyncPlugin } = await import('@/plugins/healthSync');
        await HealthSyncPlugin.clearAuthToken();
        logger.debug('HealthKit sync plugin auth token cleared on logout');
      } catch (error) {
        logger.warn('Failed to clear HealthKit sync token on logout');
      }
      
      queryClient.clear();
      setLocation('/mobile-auth');
    } else {
      window.location.href = '/api/logout';
    }
  };

  const handleSettingsClick = () => {
    setLocation('/profile');
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <DashboardErrorBoundary isDark={isDark}>
        <DashboardScreen 
          isDark={isDark}
          onSettingsClick={handleSettingsClick}
          onThemeToggle={toggleTheme}
          onLogout={handleLogout}
          onTalkToFlo={handleTalkToFlo}
        />
      </DashboardErrorBoundary>
      
      <BottomNav 
        isDark={isDark}
        onAddClick={() => setIsVoiceChatOpen(true)}
      />

      {/* Render VoiceChatScreen always (hidden when closed) to avoid first-render lag on iOS */}
      <div style={{ display: isVoiceChatOpen ? 'block' : 'none' }}>
        <VoiceChatScreen 
          isDark={isDark}
          onClose={() => {
            setIsVoiceChatOpen(false);
            setVoiceChatContext(undefined);
          }}
          initialContext={voiceChatContext}
        />
      </div>
    </div>
  );
}

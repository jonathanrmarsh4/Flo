import { useState } from 'react';
import { Moon, Sun, LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence } from 'framer-motion';
import { DashboardScreen } from '@/components/DashboardScreen';
import { BottomNav } from '@/components/BottomNav';
import { VoiceChatScreen } from '@/components/VoiceChatScreen';
import { useAuth } from '@/hooks/useAuth';
import { useHealthKitAutoPermission } from '@/hooks/useHealthKitAutoPermission';
import { queryClient } from '@/lib/queryClient';
import { logger } from '@/lib/logger';

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(true);
  const [isVoiceChatOpen, setIsVoiceChatOpen] = useState(false);

  // Automatically request HealthKit permissions on iOS app launch
  useHealthKitAutoPermission();

  const handleLogout = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
        await SecureStoragePlugin.remove({ key: 'auth_token' });
        logger.debug('JWT token cleared from secure storage on logout');
      } catch (error) {
        logger.error('Failed to clear auth token on logout', error);
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

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <div className="relative min-h-screen">
      <DashboardScreen 
        isDark={isDark}
        onSettingsClick={handleSettingsClick}
      />
      
      <BottomNav 
        isDark={isDark}
        onAddClick={() => setIsVoiceChatOpen(true)}
      />

      {/* Render VoiceChatScreen always (hidden when closed) to avoid first-render lag on iOS */}
      <div style={{ display: isVoiceChatOpen ? 'block' : 'none' }}>
        <VoiceChatScreen 
          isDark={isDark}
          onClose={() => setIsVoiceChatOpen(false)}
        />
      </div>
    </div>
  );
}

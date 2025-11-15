import { useState } from 'react';
import { Moon, Sun, LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { DashboardScreen } from '@/components/DashboardScreen';
import { BottomNav } from '@/components/BottomNav';
import { UnifiedUploadModal } from '@/components/UnifiedUploadModal';
import { useAuth } from '@/hooks/useAuth';
import { queryClient } from '@/lib/queryClient';

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleLogout = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
        await SecureStoragePlugin.remove({ key: 'auth_token' });
        console.log('[Logout] JWT token cleared from secure storage');
      } catch (error) {
        console.error('[Logout] Failed to clear token:', error);
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
        onAddClick={() => setIsAddModalOpen(true)}
      />

      {isAddModalOpen && (
        <UnifiedUploadModal 
          isDark={isDark}
          onClose={() => setIsAddModalOpen(false)}
          initialMode="lab-results"
        />
      )}
    </div>
  );
}

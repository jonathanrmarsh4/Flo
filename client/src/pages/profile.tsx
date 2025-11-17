import { useState } from 'react';
import { useLocation } from 'wouter';
import { ProfileScreen } from '@/components/ProfileScreen';
import { FloBottomNav } from '@/components/FloBottomNav';
import { useAuth } from '@/hooks/useAuth';

export default function Profile() {
  console.log('[Profile Page] RENDERING PROFILE PAGE');
  const { user } = useAuth();
  console.log('[Profile Page] User:', user ? 'loaded' : 'null');
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(true);

  const handleClose = () => {
    setLocation('/dashboard');
  };

  if (!user) {
    console.log('[Profile Page] No user, showing loading spinner');
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  console.log('[Profile Page] About to render ProfileScreen component');
  return (
    <div className="h-screen overflow-hidden">
      <ProfileScreen 
        isDark={isDark}
        onClose={handleClose}
        user={user}
      />
      <FloBottomNav />
    </div>
  );
}

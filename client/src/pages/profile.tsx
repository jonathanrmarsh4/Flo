import { useState } from 'react';
import { useLocation } from 'wouter';
import { ProfileScreen } from '@/components/ProfileScreen';
import { FloBottomNav } from '@/components/FloBottomNav';
import { useAuth } from '@/hooks/useAuth';

export default function Profile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(true);

  const handleClose = () => {
    setLocation('/dashboard');
  };

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

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

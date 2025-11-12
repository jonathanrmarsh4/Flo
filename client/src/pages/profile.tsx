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

  return (
    <div className="h-screen overflow-hidden">
      <ProfileScreen 
        isDark={isDark}
        onClose={handleClose}
      />
      <FloBottomNav />
    </div>
  );
}

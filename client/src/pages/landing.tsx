import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { LoginScreen } from '@/components/LoginScreen';
import { useTheme } from '@/components/theme-provider';

export default function Landing() {
  const { isDark } = useTheme();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      navigate('/mobile-auth');
    }
  }, [navigate]);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  if (Capacitor.isNativePlatform()) {
    return null;
  }

  return <LoginScreen onLogin={handleLogin} isDark={isDark} />;
}

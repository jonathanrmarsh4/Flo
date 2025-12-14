import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { LoginScreen } from '@/components/LoginScreen';

export default function Landing() {
  const [isDark, setIsDark] = useState(true);
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

import { useState } from 'react';
import { LoginScreen } from '@/components/LoginScreen';

export default function Landing() {
  const [isDark, setIsDark] = useState(true);

  const handleLogin = () => {
    // Redirect to Replit Auth login
    window.location.href = "/api/login";
  };

  return <LoginScreen onLogin={handleLogin} isDark={isDark} />;
}

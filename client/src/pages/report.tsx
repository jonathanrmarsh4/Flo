import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { FullReportScreen } from '@/components/FullReportScreen';
import { useAuth } from '@/hooks/useAuth';

export default function Report() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const [isDark, setIsDark] = useState(true);

  const analysisId = params.id;

  const { data: analysis } = useQuery<any>({
    queryKey: analysisId ? [`/api/blood-work/${analysisId}/analysis`] : ['/api/blood-work/latest'],
    enabled: !!user,
  });

  const handleBack = () => {
    if (analysisId) {
      setLocation(`/insights/${analysisId}`);
    } else {
      setLocation('/dashboard');
    }
  };

  return (
    <div className="h-screen overflow-hidden">
      <FullReportScreen 
        isDark={isDark}
        onClose={handleBack}
      />
    </div>
  );
}

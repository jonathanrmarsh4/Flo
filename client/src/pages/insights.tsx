import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { InsightsScreen } from '@/components/InsightsScreen';
import { useAuth } from '@/hooks/useAuth';

export default function Insights() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const [isDark, setIsDark] = useState(true);

  const analysisId = params.id;

  const { data: analysis } = useQuery<any>({
    queryKey: analysisId ? [`/api/blood-work/${analysisId}/analysis`] : ['/api/blood-work/latest'],
    enabled: !!user,
  });

  const handleClose = () => {
    setLocation('/dashboard');
  };

  const handleOpenFullReport = () => {
    if (analysisId) {
      setLocation(`/report/${analysisId}`);
    } else if (analysis?.id) {
      setLocation(`/report/${analysis.id}`);
    }
  };

  return (
    <div className="h-screen overflow-hidden">
      <InsightsScreen 
        isDark={isDark}
        onClose={handleClose}
        onOpenFullReport={handleOpenFullReport}
      />
    </div>
  );
}

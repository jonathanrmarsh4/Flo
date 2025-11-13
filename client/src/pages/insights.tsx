import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { InsightsScreen } from '@/components/InsightsScreen';
import { FloBottomNav } from '@/components/FloBottomNav';
import { useAuth } from '@/hooks/useAuth';
import { 
  mapAnalysisToBiomarkerReadings,
  getTopBiomarkersToImprove,
  getAIInsight
} from '@/lib/flo-data-adapters';
import type { AnalysisResult } from '@shared/schema';

interface BiologicalAgeResponse {
  biologicalAge: number;
  chronologicalAge: number;
  ageDifference: number;
  testDate: string;
  sessionId: string;
}

export default function Insights() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const [isDark, setIsDark] = useState(true);

  const analysisId = params.id;

  const { data: analysis } = useQuery<AnalysisResult>({
    queryKey: analysisId ? [`/api/blood-work/${analysisId}/analysis`] : ['/api/blood-work/latest'],
    enabled: !!user,
  });

  // Fetch real biological age from the new endpoint
  const { data: biologicalAgeData } = useQuery<BiologicalAgeResponse>({
    queryKey: ['/api/biological-age'],
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

  // Transform backend data for UI
  const readings = mapAnalysisToBiomarkerReadings(analysis);
  const ageData = biologicalAgeData ? {
    biologicalAge: biologicalAgeData.biologicalAge,
    chronologicalAge: biologicalAgeData.chronologicalAge,
    ageDifference: biologicalAgeData.ageDifference,
  } : undefined;
  const topBiomarkers = getTopBiomarkersToImprove(readings);
  const aiInsight = getAIInsight(analysis);

  return (
    <div className="h-screen overflow-hidden">
      <InsightsScreen 
        isDark={isDark}
        onClose={handleClose}
        onOpenFullReport={handleOpenFullReport}
        ageData={ageData}
        topBiomarkers={topBiomarkers}
        aiInsight={aiInsight}
      />
      <FloBottomNav />
    </div>
  );
}

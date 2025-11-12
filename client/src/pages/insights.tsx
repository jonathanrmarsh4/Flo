import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { InsightsScreen } from '@/components/InsightsScreen';
import { useAuth } from '@/hooks/useAuth';
import { 
  mapAnalysisToBiomarkerReadings,
  getBiologicalAgeData,
  getTopBiomarkersToImprove,
  getAIInsight
} from '@/lib/flo-data-adapters';
import type { AnalysisResult } from '@shared/schema';

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
  const ageData = getBiologicalAgeData(analysis);
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
    </div>
  );
}

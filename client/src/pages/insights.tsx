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

interface ComprehensiveHealthInsights {
  id: string;
  userId: string;
  analysisData: any;
  dataWindowDays: number | null;
  model: string;
  generatedAt: string;
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

  // Fetch comprehensive health insights
  const { data: comprehensiveInsights } = useQuery<ComprehensiveHealthInsights>({
    queryKey: ['/api/health-insights'],
    enabled: !!user,
  });

  // Fetch top 3 biomarkers to improve
  const { data: topBiomarkersData } = useQuery<{ topBiomarkers: any[] }>({
    queryKey: ['/api/biomarkers/top-to-improve'],
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
  
  // Use real top biomarkers data from API, fallback to placeholder
  const topBiomarkers = topBiomarkersData?.topBiomarkers || getTopBiomarkersToImprove(readings);
  
  // Use comprehensive insights if available, fallback to old analysis insights
  const aiInsight = comprehensiveInsights?.analysisData?.overall_health_narrative 
    || getAIInsight(analysis);
  const comprehensiveData = comprehensiveInsights?.analysisData;

  return (
    <div className="h-screen overflow-hidden">
      <InsightsScreen 
        isDark={isDark}
        onClose={handleClose}
        onOpenFullReport={handleOpenFullReport}
        ageData={ageData}
        topBiomarkers={topBiomarkers}
        aiInsight={aiInsight}
        comprehensiveInsights={comprehensiveData}
      />
      <FloBottomNav />
    </div>
  );
}

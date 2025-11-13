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

  // Always fetch user profile for age calculation fallback
  const { data: profile } = useQuery<{ dateOfBirth?: string }>({
    queryKey: ['/api/profile'],
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

  // Calculate chronological age from profile as fallback
  let chronologicalAgeFallback: number | undefined = undefined;
  if (profile?.dateOfBirth) {
    console.log('[Age Calculation] Profile DOB:', profile.dateOfBirth);
    const today = new Date();
    const birthDate = new Date(profile.dateOfBirth);
    console.log('[Age Calculation] Today:', today);
    console.log('[Age Calculation] Birth Date:', birthDate);
    console.log('[Age Calculation] Today Month (0-indexed):', today.getMonth());
    console.log('[Age Calculation] Birth Month (0-indexed):', birthDate.getMonth());
    chronologicalAgeFallback = today.getFullYear() - birthDate.getFullYear() - 
      (today.getMonth() < birthDate.getMonth() || 
       (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);
    console.log('[Age Calculation] Calculated Age:', chronologicalAgeFallback);
  } else {
    console.log('[Age Calculation] No profile DOB available');
  }
  console.log('[Age Calculation] Profile data:', profile);
  console.log('[Age Calculation] BiologicalAgeData:', biologicalAgeData);

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
        chronologicalAgeFallback={chronologicalAgeFallback}
        topBiomarkers={topBiomarkers}
        aiInsight={aiInsight}
        comprehensiveInsights={comprehensiveData}
      />
      <FloBottomNav />
    </div>
  );
}

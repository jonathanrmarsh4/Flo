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
  
  // Extract top 3 biomarkers from comprehensive insights (sorted by priority_score)
  // Note: The API spreads analysisData directly, so per_biomarker_analyses is at top level
  let topBiomarkers: any[] = [];
  console.log('[Top Biomarkers Debug] Comprehensive insights:', comprehensiveInsights);
  console.log('[Top Biomarkers Debug] Has per_biomarker_analyses:', !!comprehensiveInsights?.per_biomarker_analyses);
  
  if (comprehensiveInsights?.per_biomarker_analyses) {
    const biomarkerAnalyses = comprehensiveInsights.per_biomarker_analyses;
    console.log('[Top Biomarkers Debug] Raw biomarker analyses:', biomarkerAnalyses);
    console.log('[Top Biomarkers Debug] Number of biomarkers:', biomarkerAnalyses.length);
    
    topBiomarkers = biomarkerAnalyses
      .sort((a: any, b: any) => (b.priority_score || 0) - (a.priority_score || 0))
      .slice(0, 3)
      .map((bm: any) => ({
        name: bm.label,
        value: `${bm.latest_value} ${bm.unit}`,
        status: bm.status || 'unknown',
        trend: bm.trend?.direction || 'unchanged',
        color: bm.priority_score >= 50 ? 'red' : 
               bm.priority_score >= 20 ? 'amber' : 'yellow',
        benefit: bm.ai_insight?.summary || `Monitor ${bm.label} levels`,
        sparkline: [1, 2, 3, 4, 5], // Dummy sparkline data for now
        change: '+0.0%' // Placeholder change value
      }));
    
    console.log('[Top Biomarkers Debug] Mapped top biomarkers:', topBiomarkers);
  } else {
    // Fallback to old method if no comprehensive insights
    console.log('[Top Biomarkers Debug] Using fallback method');
    topBiomarkers = getTopBiomarkersToImprove(readings);
  }
  console.log('[Top Biomarkers Debug] Final topBiomarkers array:', topBiomarkers);
  
  // Use comprehensive insights if available, fallback to old analysis insights
  // Note: overall_health_narrative is at top level since API spreads analysisData
  const aiInsight = comprehensiveInsights?.overall_health_narrative 
    || getAIInsight(analysis);
  const comprehensiveData = comprehensiveInsights;

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

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import { DiagnosticResultsScreen } from "@/components/DiagnosticResultsScreen";
import { BottomNav } from "@/components/BottomNav";
import { UnifiedUploadModal } from "@/components/UnifiedUploadModal";

interface CalciumScoreSummary {
  totalScore: number | null;
  riskLevel: string | null;
  agePercentile: number | null;
  studyDate: string;
}

interface DexaScanSummary {
  spineTScore: number | null;
  hipTScore: number | null;
  whoClassification: string | null;
  bodyFatPercent: number | null;
  vatArea: number | null;
  studyDate: string;
}

interface DiagnosticResultsSummary {
  calciumScore: CalciumScoreSummary | null;
  dexaScan: DexaScanSummary | null;
}

interface UserProfile {
  sex: 'Male' | 'Female' | 'Other' | null;
}

export default function DiagnosticsPage() {
  const [, setLocation] = useLocation();
  const { isDark } = useTheme();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { data, isLoading } = useQuery<DiagnosticResultsSummary>({
    queryKey: ['/api/diagnostics/summary'],
  });

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['/api/profile'],
  });

  const handleClose = () => {
    setLocation('/dashboard');
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden">
      <DiagnosticResultsScreen 
        isDark={isDark}
        calciumScore={data?.calciumScore ?? null}
        dexaScan={data?.dexaScan ?? null}
        userSex={profile?.sex ?? null}
        onClose={handleClose}
      />
      <BottomNav 
        isDark={isDark}
        onAddClick={() => setIsAddModalOpen(true)}
      />

      {isAddModalOpen && (
        <UnifiedUploadModal 
          isDark={isDark}
          onClose={() => setIsAddModalOpen(false)}
          initialMode="diagnostics"
        />
      )}
    </div>
  );
}

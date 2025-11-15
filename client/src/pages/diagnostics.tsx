import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DiagnosticResultsScreen } from "@/components/DiagnosticResultsScreen";
import { FloBottomNav } from "@/components/FloBottomNav";

interface CalciumScoreSummary {
  totalScore: number | null;
  riskLevel: string | null;
  agePercentile: number | null;
  studyDate: string;
}

interface DiagnosticResultsSummary {
  calciumScore: CalciumScoreSummary | null;
}

export default function DiagnosticsPage() {
  const [, setLocation] = useLocation();
  const [isDark] = useState(true);

  const { data, isLoading } = useQuery<DiagnosticResultsSummary>({
    queryKey: ['/api/diagnostics/summary'],
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
        onClose={handleClose}
      />
      <FloBottomNav />
    </div>
  );
}

import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DiagnosticResultsScreen } from "@/components/DiagnosticResultsScreen";

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

  const { data, isLoading } = useQuery<DiagnosticResultsSummary>({
    queryKey: ['/api/diagnostics/summary'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-muted-foreground">Loading diagnostics...</p>
        </div>
      </div>
    );
  }

  return (
    <DiagnosticResultsScreen 
      calciumScore={data?.calciumScore ?? null}
      onClose={() => setLocation("/dashboard")}
    />
  );
}

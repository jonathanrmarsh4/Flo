import { useLocation } from "wouter";
import { DiagnosticResultsScreen } from "@/components/DiagnosticResultsScreen";

export default function DiagnosticsPage() {
  const [, setLocation] = useLocation();

  return (
    <DiagnosticResultsScreen 
      isDark={true}
      onClose={() => setLocation("/dashboard")}
    />
  );
}

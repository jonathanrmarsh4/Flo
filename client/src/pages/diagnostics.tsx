import { useState } from "react";
import { useLocation } from "wouter";
import { DiagnosticResultsScreen } from "@/components/DiagnosticResultsScreen";

export default function DiagnosticsPage() {
  const [, setLocation] = useLocation();
  const [isDark] = useState(true);

  return (
    <DiagnosticResultsScreen 
      isDark={isDark}
      onClose={() => setLocation("/dashboard")}
    />
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, getApiBaseUrl } from "@/lib/queryClient";
import { FileText, Share2, Loader2 } from "lucide-react";
import { HealthReportScreen, HealthReportData } from "./HealthReportScreen";

export function ReportTile() {
  const { toast } = useToast();
  const [showFullReport, setShowFullReport] = useState(false);
  const [reportData, setReportData] = useState<HealthReportData | null>(null);

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = getApiBaseUrl();
      const headers = await getAuthHeaders();
      
      console.log('[ReportTile] Generating health summary report with auth headers:', Object.keys(headers));
      
      const response = await fetch(`${baseUrl}/api/health-summary-report`, {
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to generate report');
      }
      return response.json() as Promise<HealthReportData>;
    },
    onSuccess: (data) => {
      console.log('[ReportTile] API response received:', JSON.stringify(data, null, 2));
      console.log('[ReportTile] patientData:', data?.patientData);
      console.log('[ReportTile] biomarkerCategories count:', data?.biomarkerCategories?.length);
      console.log('[ReportTile] retestRecommendations count:', data?.retestRecommendations?.length);
      setReportData(data);
      setShowFullReport(true);
    },
    onError: (error: any) => {
      const errorMessage = error.message || "Failed to generate report";
      
      let description = errorMessage;
      if (errorMessage.includes("profile data") || errorMessage.includes("age and sex")) {
        description = "Please complete your age and sex in your profile to generate a report.";
      } else if (errorMessage.includes("biomarker") || errorMessage.includes("test results")) {
        description = "Please add at least one blood work session to generate a report.";
      }
      
      toast({
        title: "Report Generation Failed",
        description,
        variant: "destructive",
      });
    },
  });

  const handleViewReport = () => {
    generateReportMutation.mutate();
  };

  return (
    <>
      <div className="rounded-2xl border p-6 bg-slate-800/40 border-white/10 mb-4" data-testid="tile-health-report">
        <div className="flex flex-col gap-4">
          {/* Header with icon */}
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-purple-500/20">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white">
                Health Summary Report
              </h2>
              <p className="text-sm text-white/60 mt-1">
                Comprehensive biomarker analysis ready to share
              </p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2">
            <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30 border">
              <span className="text-teal-400 mr-1">●</span>
              90+ Biomarkers
            </Badge>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 border">
              <Share2 className="w-3 h-3 mr-1" />
              Shareable
            </Badge>
          </div>

          {/* View Report Button */}
          <button
            onClick={handleViewReport}
            disabled={generateReportMutation.isPending}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            data-testid="button-view-report"
          >
            <div className="flex items-center justify-center gap-2">
              {generateReportMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  View Full Report
                </>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Health Summary Report Modal */}
      {showFullReport && (
        <HealthReportScreen 
          isDark={true} 
          onClose={() => setShowFullReport(false)} 
          reportData={reportData || undefined}
        />
      )}
    </>
  );
}

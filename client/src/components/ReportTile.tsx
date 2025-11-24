import { Badge } from "@/components/ui/badge";
import { FileText, Share2 } from "lucide-react";

export function ReportTile() {
  return (
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
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          data-testid="button-view-report"
        >
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            View Full Report
          </div>
        </button>
      </div>
    </div>
  );
}

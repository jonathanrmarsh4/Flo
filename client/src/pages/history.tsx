import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FloBottomNav } from "@/components/FloBottomNav";
import { Clock, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import type { BloodWorkRecord, AnalysisResult } from "@shared/schema";

interface RecordWithAnalysis {
  record: BloodWorkRecord;
  analysis: AnalysisResult | null;
}

export default function History() {
  const { data: records, isLoading } = useQuery<RecordWithAnalysis[]>({
    queryKey: ["/api/blood-work"],
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-title-1 font-bold">History</h1>
          <p className="text-callout text-muted-foreground mt-1">
            View your past blood work results
          </p>
        </div>
      </header>

      <div className="px-4 space-y-4 max-w-md mx-auto">
        {isLoading ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : records && records.length > 0 ? (
          <div className="space-y-4">
            {records.map(({ record, analysis }) => {
              const ageDiff = analysis?.biologicalAge && analysis?.chronologicalAge
                ? parseInt(analysis.biologicalAge) - parseInt(analysis.chronologicalAge)
                : null;

              return (
                <Link key={record.id} href={`/results/${record.id}`}>
                  <Card 
                    className="p-6 hover-elevate active-elevate-2 cursor-pointer"
                    data-testid={`record-${record.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                          <h3 className="text-callout font-semibold truncate">
                            {record.fileName}
                          </h3>
                        </div>
                        
                        <div className="flex items-center gap-2 text-subheadline text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{format(new Date(record.uploadedAt!), "MMM d, yyyy")}</span>
                        </div>

                        {analysis?.biologicalAge && (
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="font-semibold">
                              Age: {analysis.biologicalAge}
                            </Badge>
                            {ageDiff !== null && ageDiff !== 0 && (
                              <div className="flex items-center gap-1">
                                {ageDiff < 0 ? (
                                  <TrendingDown className="w-4 h-4 text-success" />
                                ) : (
                                  <TrendingUp className="w-4 h-4 text-destructive" />
                                )}
                                <span className={`text-footnote font-medium ${
                                  ageDiff < 0 ? "text-success" : "text-destructive"
                                }`}>
                                  {Math.abs(ageDiff)}y
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <Badge 
                        variant={
                          record.status === "completed" ? "default" :
                          record.status === "processing" ? "secondary" :
                          record.status === "failed" ? "destructive" :
                          "secondary"
                        }
                      >
                        {record.status}
                      </Badge>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-title-2 font-semibold mb-2">No History Yet</h3>
            <p className="text-callout text-muted-foreground">
              Upload your first blood work to start tracking
            </p>
          </Card>
        )}
      </div>
      <FloBottomNav />
    </div>
  );
}

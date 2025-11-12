import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Heart, Droplet, Zap } from "lucide-react";
import { format } from "date-fns";
import type { BloodWorkRecord, AnalysisResult } from "@shared/schema";

interface RecordWithAnalysis {
  record: BloodWorkRecord;
  analysis: AnalysisResult | null;
}

export default function Results() {
  const [, params] = useRoute("/results/:id");
  const recordId = params?.id;

  const { data, isLoading } = useQuery<RecordWithAnalysis>({
    queryKey: ["/api/blood-work", recordId],
    enabled: !!recordId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="px-4 pt-6 pb-8 space-y-6 max-w-md mx-auto">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-title-2 font-semibold mb-2">Not Found</h2>
          <p className="text-callout text-muted-foreground mb-6">
            The blood work record you're looking for doesn't exist.
          </p>
          <Link href="/history">
            <Button>Back to History</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const { record, analysis } = data;
  const insights = (analysis?.insights as any[]) || [];
  const recommendations = (analysis?.recommendations as string[]) || [];
  const metrics = (analysis?.metrics as any) || {};

  const ageDiff = analysis?.biologicalAge && analysis?.chronologicalAge
    ? parseInt(analysis.biologicalAge) - parseInt(analysis.chronologicalAge)
    : null;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-md mx-auto">
          <Link href="/history">
            <Button
              variant="ghost"
              className="mb-4 -ml-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-title-2 font-bold truncate">{record.fileName}</h1>
          <p className="text-subheadline text-muted-foreground mt-1">
            {format(new Date(record.uploadedAt!), "MMMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
      </header>

      <div className="px-4 space-y-6 max-w-md mx-auto mt-6">
        {/* Biological Age */}
        {analysis?.biologicalAge && (
          <Card className="p-8 bg-gradient-to-br from-primary/5 to-chart-1/5 border-primary/20">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
                <Activity className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-title-3 font-semibold text-muted-foreground mb-2">
                  Biological Age
                </h2>
                <div className="text-title-large font-bold text-primary" data-testid="biological-age">
                  {analysis.biologicalAge} years
                </div>
                {ageDiff !== null && (
                  <div className="flex items-center justify-center gap-2 mt-3">
                    {ageDiff < 0 ? (
                      <TrendingDown className="w-5 h-5 text-success" />
                    ) : ageDiff > 0 ? (
                      <TrendingUp className="w-5 h-5 text-destructive" />
                    ) : null}
                    <span className={`text-callout font-medium ${
                      ageDiff < 0 ? "text-success" : 
                      ageDiff > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      {ageDiff === 0 ? "Matches" : 
                       ageDiff < 0 ? `${Math.abs(ageDiff)} years younger` :
                       `${ageDiff} years older`} than chronological age
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-title-2 font-semibold">Insights</h2>
            <div className="space-y-3">
              {insights.map((insight, index) => (
                <Card key={index} className="p-4" data-testid={`insight-${index}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-chart-2/10 flex items-center justify-center flex-shrink-0 mt-1">
                      {index % 3 === 0 ? <Heart className="w-5 h-5 text-chart-2" /> :
                       index % 3 === 1 ? <Droplet className="w-5 h-5 text-chart-1" /> :
                       <Zap className="w-5 h-5 text-chart-3" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-callout font-semibold mb-1">
                        {insight.category || "Health Metric"}
                      </h4>
                      <p className="text-subheadline text-muted-foreground">
                        {insight.description || insight.message || "Analysis result"}
                      </p>
                      {insight.severity && (
                        <Badge 
                          variant={insight.severity === "high" ? "destructive" : "secondary"}
                          className="mt-2"
                        >
                          {insight.severity}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-title-2 font-semibold">Recommendations</h2>
            <Card className="p-4 space-y-3">
              {recommendations.map((rec, index) => (
                <div key={index} className="flex items-start gap-3" data-testid={`recommendation-${index}`}>
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <p className="text-callout text-foreground flex-1">{rec}</p>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Raw Metrics (if available) */}
        {Object.keys(metrics).length > 0 && (
          <div className="space-y-3">
            <h2 className="text-title-2 font-semibold">Blood Markers</h2>
            <Card className="p-4">
              <div className="space-y-3">
                {Object.entries(metrics).map(([key, value], index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between py-2 border-b last:border-0 border-border"
                    data-testid={`metric-${key}`}
                  >
                    <span className="text-callout font-medium">{key}</span>
                    <span className="text-callout text-muted-foreground">
                      {typeof value === "object" && value !== null 
                        ? JSON.stringify(value) 
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

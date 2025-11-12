import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Activity, Heart, Droplet, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { BloodWorkRecord, AnalysisResult } from "@shared/schema";

interface LatestAnalysis {
  record: BloodWorkRecord;
  analysis: AnalysisResult | null;
}

export default function Home() {
  const { user } = useAuth();

  const { data: latestAnalysis, isLoading } = useQuery<LatestAnalysis>({
    queryKey: ["/api/blood-work/latest"],
    enabled: !!user,
  });

  const biologicalAge = latestAnalysis?.analysis?.biologicalAge;
  const chronologicalAge = latestAnalysis?.analysis?.chronologicalAge;
  const insights = (latestAnalysis?.analysis?.insights as any[]) || [];
  const recommendations = (latestAnalysis?.analysis?.recommendations as string[]) || [];

  const ageDifference = biologicalAge && chronologicalAge 
    ? parseInt(biologicalAge) - parseInt(chronologicalAge)
    : null;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-title-1 font-bold">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="text-callout text-muted-foreground mt-1">
            Your health at a glance
          </p>
        </div>
      </header>

      <div className="px-4 space-y-6 max-w-md mx-auto">
        {/* Biological Age Card */}
        {isLoading ? (
          <Card className="p-8">
            <Skeleton className="h-32 w-full" />
          </Card>
        ) : biologicalAge ? (
          <Card className="p-8 bg-gradient-to-br from-primary/5 to-chart-1/5 border-primary/20">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
                <Activity className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-title-2 font-semibold text-muted-foreground mb-2">
                  Biological Age
                </h2>
                <div className="text-title-large font-bold text-primary">
                  {biologicalAge} years
                </div>
                {ageDifference !== null && (
                  <div className="flex items-center justify-center gap-2 mt-3">
                    {ageDifference < 0 ? (
                      <TrendingDown className="w-5 h-5 text-success" />
                    ) : ageDifference > 0 ? (
                      <TrendingUp className="w-5 h-5 text-destructive" />
                    ) : null}
                    <span className={`text-body font-medium ${
                      ageDifference < 0 ? "text-success" : 
                      ageDifference > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      {ageDifference === 0 ? "Matches" : 
                       ageDifference < 0 ? `${Math.abs(ageDifference)} years younger` :
                       `${ageDifference} years older`} than chronological age ({chronologicalAge})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-title-2 font-semibold mb-2">No Data Yet</h3>
            <p className="text-callout text-muted-foreground mb-6">
              Upload your first blood work to see your biological age
            </p>
            <Link href="/upload">
              <Button data-testid="button-upload-first">
                Upload Blood Work
              </Button>
            </Link>
          </Card>
        )}

        {/* Key Insights */}
        {insights.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-title-2 font-semibold">Latest Insights</h2>
            <div className="space-y-3">
              {insights.slice(0, 3).map((insight, index) => (
                <Card key={index} className="p-4" data-testid={`insight-${index}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-chart-2/10 flex items-center justify-center flex-shrink-0 mt-1">
                      {index === 0 ? <Heart className="w-5 h-5 text-chart-2" /> :
                       index === 1 ? <Droplet className="w-5 h-5 text-chart-1" /> :
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
              {recommendations.slice(0, 3).map((rec, index) => (
                <div key={index} className="flex items-start gap-3" data-testid={`recommendation-${index}`}>
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <p className="text-callout text-foreground flex-1">{rec}</p>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

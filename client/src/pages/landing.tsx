import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, TrendingUp, Brain, Clock } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="px-4 pt-12 pb-8">
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
            <Activity className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-title-large font-bold tracking-tight">
            Flō
          </h1>
          <p className="text-body text-muted-foreground px-4">
            Upload your blood work, get AI-powered insights, and track your biological age over time
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="px-4 py-8 space-y-4 max-w-md mx-auto">
        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-chart-1/10 flex items-center justify-center flex-shrink-0">
              <Brain className="w-5 h-5 text-chart-1" />
            </div>
            <div>
              <h3 className="text-title-3 font-semibold">AI-Powered Analysis</h3>
              <p className="text-callout text-muted-foreground">
                Get personalized health insights from your blood work results
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-chart-2/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-chart-2" />
            </div>
            <div>
              <h3 className="text-title-3 font-semibold">Biological Age</h3>
              <p className="text-callout text-muted-foreground">
                Discover your biological age based on your blood markers
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-chart-3/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-chart-3" />
            </div>
            <div>
              <h3 className="text-title-3 font-semibold">Track Over Time</h3>
              <p className="text-callout text-muted-foreground">
                Monitor changes and trends in your health metrics
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-card-border">
        <div className="max-w-md mx-auto">
          <Button
            onClick={() => window.location.href = "/api/login"}
            className="w-full h-12 text-body font-semibold"
            data-testid="button-login"
          >
            Get Started
          </Button>
          <p className="text-center text-footnote text-muted-foreground mt-3">
            Secure login powered by Replit Auth
          </p>
        </div>
      </div>
    </div>
  );
}

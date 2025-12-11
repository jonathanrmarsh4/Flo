import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ActionCard } from "@/components/ActionCard";
import { ReportTile } from "@/components/ReportTile";
import { OverdueLabWorkTile } from "@/components/OverdueLabWorkTile";
import { FloBottomNav } from "@/components/FloBottomNav";
import { usePlan } from "@/hooks/usePlan";
import { ListChecks, Filter, Sparkles, Plus, FlaskConical, Play, Pause, CheckCircle, Clock, X } from "lucide-react";
import type { ActionPlanItem } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SUPPLEMENT_CONFIGURATIONS } from "@shared/supplementConfig";

type TabFilter = 'reports' | 'interventions' | 'assessments';

interface N1Assessment {
  id: string;
  supplement_type_id: string;
  product_name: string;
  product_brand?: string;
  product_image_url?: string;
  primary_intent: string;
  status: 'pending' | 'baseline' | 'active' | 'washout' | 'completed' | 'paused' | 'cancelled';
  baseline_days: number;
  experiment_days: number;
  created_at: string;
  experiment_start_date?: string;
  experiment_end_date?: string;
}

function AssessmentCard({ assessment, onClick }: { assessment: N1Assessment; onClick: () => void }) {
  const supplementConfig = SUPPLEMENT_CONFIGURATIONS[assessment.supplement_type_id];
  
  const getStatusInfo = () => {
    switch (assessment.status) {
      case 'pending':
        return { label: 'Ready to Start', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock };
      case 'baseline':
        return { label: 'Collecting Baseline', color: 'bg-blue-500/20 text-blue-400', icon: Clock };
      case 'active':
        return { label: 'Active', color: 'bg-green-500/20 text-green-400', icon: Play };
      case 'paused':
        return { label: 'Paused', color: 'bg-orange-500/20 text-orange-400', icon: Pause };
      case 'completed':
        return { label: 'Completed', color: 'bg-cyan-500/20 text-cyan-400', icon: CheckCircle };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-red-500/20 text-red-400', icon: X };
      default:
        return { label: assessment.status, color: 'bg-white/20 text-white', icon: Clock };
    }
  };
  
  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  
  // Calculate progress
  let progress = 0;
  if (assessment.status === 'active' && assessment.experiment_start_date) {
    const startDate = new Date(assessment.experiment_start_date);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    progress = Math.min(100, Math.round((daysPassed / assessment.experiment_days) * 100));
  } else if (assessment.status === 'completed') {
    progress = 100;
  }
  
  return (
    <Card 
      className="p-4 bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
      onClick={onClick}
      data-testid={`assessment-card-${assessment.id}`}
    >
      <div className="flex items-start gap-3">
        {assessment.product_image_url ? (
          <img 
            src={assessment.product_image_url} 
            alt={assessment.product_name}
            className="w-12 h-12 rounded-lg object-cover bg-white/10"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
            <FlaskConical className="w-6 h-6 text-cyan-400" />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-medium truncate">{assessment.product_name}</h3>
          </div>
          
          {assessment.product_brand && (
            <p className="text-xs text-white/50 mb-2">{assessment.product_brand}</p>
          )}
          
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${statusInfo.color} border-0 text-xs`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusInfo.label}
            </Badge>
            
            {supplementConfig && (
              <Badge className="bg-white/10 text-white/60 border-0 text-xs">
                {supplementConfig.category}
              </Badge>
            )}
          </div>
          
          {assessment.status === 'active' && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                <span>Day {Math.floor(progress * assessment.experiment_days / 100) + 1} of {assessment.experiment_days}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5 bg-white/10" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ActionsScreen() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedTab, setSelectedTab] = useState<TabFilter>('interventions');
  
  // Check user's plan for premium features
  const { data: planData } = usePlan();
  const isFreePlan = planData?.plan?.id === 'free';

  // Fetch all action plan items
  const { data: actionPlanData, isLoading: isLoadingActions } = useQuery<{ items: ActionPlanItem[] }>({
    queryKey: ['/api/action-plan'],
  });
  
  // Fetch N-of-1 assessments
  const { data: assessmentsData, isLoading: isLoadingAssessments } = useQuery<{ experiments: N1Assessment[] }>({
    queryKey: ['/api/n1/experiments'],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest('PATCH', `/api/action-plan/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/action-plan'] });
      toast({
        title: "Status Updated",
        description: "Action item status has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update action item",
        variant: "destructive",
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/action-plan/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/action-plan'] });
      toast({
        title: "Removed",
        description: "Action item has been removed from your plan.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove action item",
        variant: "destructive",
      });
    },
  });

  const handleComplete = (id: string) => {
    updateStatusMutation.mutate({ id, status: 'completed' });
  };

  const handleDismiss = (id: string) => {
    updateStatusMutation.mutate({ id, status: 'dismissed' });
  };

  const allItems = actionPlanData?.items || [];
  const activeItems = allItems.filter(item => item.status === 'active');
  const assessments = assessmentsData?.experiments || [];
  const activeAssessments = assessments.filter(e => ['pending', 'baseline', 'active', 'paused'].includes(e.status));

  const tabOptions = [
    { value: 'reports' as TabFilter, label: 'Reports' },
    { value: 'interventions' as TabFilter, label: 'Interventions' },
    { value: 'assessments' as TabFilter, label: 'Supplements' },
  ];

  const getHeaderText = () => {
    switch (selectedTab) {
      case 'reports':
        return { title: 'Reports', subtitle: 'Health reports and summaries' };
      case 'interventions':
        return { title: 'Interventions', subtitle: `${activeItems.length} active intervention${activeItems.length !== 1 ? 's' : ''}` };
      case 'assessments':
        return { title: 'Supplements', subtitle: `${activeAssessments.length} active assessment${activeAssessments.length !== 1 ? 's' : ''}` };
    }
  };

  const headerText = getHeaderText();

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b bg-white/5 border-white/10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl text-white" data-testid="heading-actions">
              {headerText.title}
            </h1>
            <p className="text-xs text-white/50">
              {headerText.subtitle}
            </p>
          </div>
          
          {/* New Assessment Button - only show on assessments tab */}
          {selectedTab === 'assessments' && (
            <Button
              size="icon"
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
              onClick={() => setLocation('/assessments/new')}
              data-testid="button-new-assessment"
            >
              <Plus className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Tab Pills */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <Filter className="w-4 h-4 text-white/40 flex-shrink-0" />
            {tabOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedTab(option.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  selectedTab === option.value
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
                data-testid={`tab-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="overflow-y-auto px-4 py-6 pb-32" style={{ height: 'calc(100vh - 140px)' }}>
        {selectedTab === 'reports' && (
          /* Reports View */
          <div className="flex flex-col gap-4">
            <ReportTile />
          </div>
        )}

        {selectedTab === 'interventions' && (
          /* Interventions View */
          <>
            {/* Lab Work Overdue Tile */}
            <div className="mb-4">
              <OverdueLabWorkTile />
            </div>

            {/* Premium Upgrade Banner for Free Users */}
            {isFreePlan && (
              <div 
                className="mb-4 p-4 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10"
                data-testid="premium-upgrade-banner"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold mb-1">Unlock AI-Powered Actions</h3>
                    <p className="text-white/70 text-sm leading-relaxed">
                      Upgrade to Flo Premium to get personalized AI insights and actionable recommendations based on your health data.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20"
                      onClick={() => setLocation('/billing')}
                      data-testid="button-upgrade-premium"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Upgrade to Premium
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Action Items List */}
            {isLoadingActions ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
              </div>
            ) : activeItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-4 py-12">
                <ListChecks className="w-16 h-16 text-white/20" />
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-white">No Active Actions</h3>
                  <p className="text-sm text-white/60 mb-4">
                    {isFreePlan 
                      ? 'Upgrade to Premium to unlock personalized AI insights and actions tailored to your health data.'
                      : 'Add insights from your AI Insights to start tracking your health goals.'
                    }
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {activeItems.map((item) => (
                  <ActionCard
                    key={item.id}
                    item={item}
                    onComplete={handleComplete}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {selectedTab === 'assessments' && (
          /* Assessments View */
          <>
            {isLoadingAssessments ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
              </div>
            ) : assessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-4 py-12">
                <FlaskConical className="w-16 h-16 text-white/20" />
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-white">No Assessments Yet</h3>
                  <p className="text-sm text-white/60 mb-4 max-w-xs">
                    Start your first N-of-1 assessment to scientifically test if a supplement works for YOUR body.
                  </p>
                  <Button
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                    onClick={() => setLocation('/assessments/new')}
                    data-testid="button-start-first-assessment"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Start Your First Assessment
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Active Assessments */}
                {activeAssessments.length > 0 && (
                  <>
                    <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">Active</h2>
                    {activeAssessments.map((assessment) => (
                      <AssessmentCard
                        key={assessment.id}
                        assessment={assessment}
                        onClick={() => setLocation(`/assessments/${assessment.id}`)}
                      />
                    ))}
                  </>
                )}
                
                {/* Completed Assessments */}
                {assessments.filter(e => e.status === 'completed').length > 0 && (
                  <>
                    <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mt-4">Completed</h2>
                    {assessments.filter(e => e.status === 'completed').map((assessment) => (
                      <AssessmentCard
                        key={assessment.id}
                        assessment={assessment}
                        onClick={() => setLocation(`/assessments/${assessment.id}`)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      <FloBottomNav />
    </div>
  );
}

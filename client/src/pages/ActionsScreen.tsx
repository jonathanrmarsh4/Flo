import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ActionCard } from "@/components/ActionCard";
import { ReportTile } from "@/components/ReportTile";
import { FloBottomNav } from "@/components/FloBottomNav";
import { Target, ListChecks } from "lucide-react";
import type { ActionPlanItem } from "@shared/schema";

export default function ActionsScreen() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>("active");

  // Fetch all action plan items
  const { data: actionPlanData, isLoading } = useQuery<{ items: ActionPlanItem[] }>({
    queryKey: ['/api/action-plan'],
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

  const handleRemove = (id: string) => {
    removeItemMutation.mutate(id);
  };

  const allItems = actionPlanData?.items || [];
  const activeItems = allItems.filter(item => item.status === 'active');
  const completedItems = allItems.filter(item => item.status === 'completed');
  const dismissedItems = allItems.filter(item => item.status === 'dismissed');

  return (
    <>
      {/* Background Gradient */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50 dark:from-slate-900 dark:via-blue-950 dark:to-slate-900" />

      <div className="relative min-h-screen pb-24">
        <div className="flex flex-col gap-6 p-4 max-w-4xl mx-auto">
          {/* Sticky Header */}
          <div className="sticky top-0 z-20 backdrop-blur-xl border-b transition-colors bg-white/70 border-black/10 dark:bg-white/5 dark:border-white/10">
            <div className="flex items-center gap-3 p-4">
              <Target className="w-6 h-6 text-teal-400" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="heading-actions">
                  Action Plan
                </h1>
                <p className="text-sm text-gray-600 dark:text-white/60">
                  Track your health improvement goals
                </p>
              </div>
            </div>
          </div>

      {/* Report Tile - Summary of progress */}
      <ReportTile
        totalActive={activeItems.length}
        totalCompleted={completedItems.length}
        recentCompletions={completedItems.slice(0, 3)}
      />

      {/* Tabs for Active/Completed/Dismissed */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active" data-testid="tab-active">
            Active ({activeItems.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed ({completedItems.length})
          </TabsTrigger>
          <TabsTrigger value="dismissed" data-testid="tab-dismissed">
            Dismissed ({dismissedItems.length})
          </TabsTrigger>
        </TabsList>

        {/* Active Actions */}
        <TabsContent value="active" className="mt-6">
          <div className="backdrop-blur-xl rounded-2xl border p-6 bg-white/60 border-black/10 dark:bg-white/5 dark:border-white/10">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-400"></div>
              </div>
            ) : activeItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ListChecks className="w-16 h-16 text-gray-300 dark:text-white/20 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  No Active Actions
                </h3>
                <p className="text-sm text-gray-600 dark:text-white/60 mb-4">
                  Add insights from your AI Insights to start tracking your health goals.
                </p>
                <Button
                  onClick={() => setLocation('/insights')}
                  data-testid="button-browse-insights"
                >
                  Browse Insights
                </Button>
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
          </div>
        </TabsContent>

        {/* Completed Actions */}
        <TabsContent value="completed" className="mt-6">
          <div className="backdrop-blur-xl rounded-2xl border p-6 bg-white/60 border-black/10 dark:bg-white/5 dark:border-white/10">
            {completedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ListChecks className="w-16 h-16 text-gray-300 dark:text-white/20 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  No Completed Actions
                </h3>
                <p className="text-sm text-gray-600 dark:text-white/60">
                  Complete active actions to see them here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {completedItems.map((item) => (
                  <ActionCard
                    key={item.id}
                    item={item}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Dismissed Actions */}
        <TabsContent value="dismissed" className="mt-6">
          <div className="backdrop-blur-xl rounded-2xl border p-6 bg-white/60 border-black/10 dark:bg-white/5 dark:border-white/10">
            {dismissedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ListChecks className="w-16 h-16 text-gray-300 dark:text-white/20 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  No Dismissed Actions
                </h3>
                <p className="text-sm text-gray-600 dark:text-white/60">
                  Dismissed actions will appear here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {dismissedItems.map((item) => (
                  <ActionCard
                    key={item.id}
                    item={item}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
        </div>

        <FloBottomNav />
      </div>
    </>
  );
}

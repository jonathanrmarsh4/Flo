import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ActionCard } from "@/components/ActionCard";
import { ReportTile } from "@/components/ReportTile";
import { FloBottomNav } from "@/components/FloBottomNav";
import { Target, ListChecks, Filter } from "lucide-react";
import type { ActionPlanItem } from "@shared/schema";

type CategoryFilter = 'all' | 'sleep_quality' | 'performance_activity' | 'biomarkers' | 'recovery_hrv' | 'nutrition';

export default function ActionsScreen() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

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
  
  // Filter active items by category
  const filteredItems = selectedCategory === 'all'
    ? activeItems
    : activeItems.filter(item => item.category === selectedCategory);

  const categoryFilterOptions = [
    { value: 'all' as CategoryFilter, label: 'All' },
    { value: 'sleep_quality' as CategoryFilter, label: 'Sleep' },
    { value: 'performance_activity' as CategoryFilter, label: 'Activity' },
    { value: 'biomarkers' as CategoryFilter, label: 'Biomarkers' },
    { value: 'recovery_hrv' as CategoryFilter, label: 'Recovery' },
    { value: 'nutrition' as CategoryFilter, label: 'Nutrition' },
  ];

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
                  {activeItems.length} active action{activeItems.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="px-4 pb-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                <Filter className="w-4 h-4 text-gray-400 dark:text-white/40 flex-shrink-0" />
                {categoryFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedCategory(option.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                      selectedCategory === option.value
                        ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg'
                        : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/20'
                    }`}
                    data-testid={`filter-${option.value}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

      {/* Report Tile - Health Summary */}
      <ReportTile />

      {/* Action Items List */}
      {isLoading ? (
        <div className="backdrop-blur-xl rounded-2xl border p-12 bg-white/60 border-black/10 dark:bg-white/5 dark:border-white/10">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-400"></div>
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="backdrop-blur-xl rounded-2xl border p-12 bg-white/60 border-black/10 dark:bg-white/5 dark:border-white/10">
          <div className="flex flex-col items-center justify-center text-center gap-4">
            <ListChecks className="w-16 h-16 text-gray-300 dark:text-white/20" />
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                {selectedCategory === 'all' ? 'No Active Actions' : `No ${categoryFilterOptions.find(o => o.value === selectedCategory)?.label} Actions`}
              </h3>
              <p className="text-sm text-gray-600 dark:text-white/60 mb-4">
                {selectedCategory === 'all'
                  ? 'Add insights from your AI Insights to start tracking your health goals.'
                  : 'Try selecting a different category to see more actions.'
                }
              </p>
              {selectedCategory === 'all' && (
                <Button
                  onClick={() => setLocation('/insights')}
                  data-testid="button-browse-insights"
                >
                  Browse Insights
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredItems.map((item) => (
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

        <FloBottomNav />
      </div>
    </>
  );
}

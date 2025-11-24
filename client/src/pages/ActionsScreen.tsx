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
import { Target, ListChecks, Filter, Plus, X } from "lucide-react";
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

  // Log data when it changes
  if (actionPlanData?.items) {
    console.log('[ActionsScreen] Action plan items loaded:', actionPlanData.items.map(item => ({
      id: item.id,
      title: item.snapshotTitle,
      targetBiomarker: item.targetBiomarker,
      currentValue: item.currentValue,
      targetValue: item.targetValue,
      unit: item.unit,
    })));
  }

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
    <div className="relative h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 pt-[env(safe-area-inset-top)] border-b border-white/10">
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-white mb-1" data-testid="heading-actions">
                  Action Plan
                </h1>
                <p className="text-sm text-white/60">
                  {activeItems.length} active action{activeItems.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button className="p-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/50">
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
              <Filter className="w-4 h-4 text-white/40 flex-shrink-0" />
              {categoryFilterOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedCategory(option.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    selectedCategory === option.value
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                  data-testid={`filter-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-none px-6 py-4">
          {/* Lab Work Overdue Tile - Collapsible, starts collapsed */}
          <div className="mb-4">
            <OverdueLabWorkTile />
          </div>

          {/* Action Items List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-4 py-12">
              <ListChecks className="w-16 h-16 text-white/20" />
              <div>
                <h3 className="text-lg font-semibold mb-2 text-white">
                  {selectedCategory === 'all' ? 'No Active Actions' : `No ${categoryFilterOptions.find(o => o.value === selectedCategory)?.label} Actions`}
                </h3>
                <p className="text-sm text-white/60 mb-4">
                  {selectedCategory === 'all'
                    ? 'Add insights from your AI Insights to start tracking your health goals.'
                    : 'Try selecting a different category to see more actions.'
                  }
                </p>
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

          {/* Report Tile - Health Summary (moved to bottom) */}
          <div className="mt-4">
            <ReportTile />
          </div>
        </div>

        {/* Bottom Navigation */}
        <FloBottomNav />
      </div>
    </div>
  );
}

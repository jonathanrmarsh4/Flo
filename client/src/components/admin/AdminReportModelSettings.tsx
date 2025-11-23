import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, Zap } from 'lucide-react';

interface SystemSetting {
  id: string;
  settingKey: string;
  settingValue: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export function AdminReportModelSettings() {
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch current report model setting
  const { data: reportModelSetting, isLoading } = useQuery<SystemSetting>({
    queryKey: ['/api/admin/settings', 'report_ai_model'],
    queryFn: async () => {
      try {
        const result = await apiRequest('GET', '/api/admin/settings?key=report_ai_model');
        return result as SystemSetting;
      } catch (error: any) {
        // If setting doesn't exist yet, return default
        if (error.message?.includes('Setting not found') || error.message?.includes('404')) {
          return {
            id: '',
            settingKey: 'report_ai_model',
            settingValue: 'gpt',
            description: 'AI model for comprehensive health report generation',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        throw error;
      }
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: async (model: 'gpt' | 'grok') => {
      return await apiRequest('POST', '/api/admin/settings', {
        settingKey: 'report_ai_model',
        settingValue: model,
        description: 'AI model for comprehensive health report generation',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings', 'report_ai_model'] });
      setIsUpdating(false);
      toast({
        title: 'Model Updated',
        description: 'Report AI model has been updated successfully',
      });
    },
    onError: (error: any) => {
      setIsUpdating(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update AI model setting',
        variant: 'destructive',
      });
    },
  });

  const currentModel = reportModelSetting?.settingValue || 'gpt';

  const handleModelChange = (model: 'gpt' | 'grok') => {
    if (model === currentModel) return;
    setIsUpdating(true);
    updateModelMutation.mutate(model);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white/5 border-white/10 p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h4 className="text-base font-medium text-white mb-1">
            Comprehensive Report Generator
          </h4>
          <p className="text-sm text-white/60">
            Choose which AI model powers the full health report generation
          </p>
        </div>
        <Sparkles className="w-5 h-5 text-cyan-400" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* GPT-4o Option */}
        <button
          onClick={() => handleModelChange('gpt')}
          disabled={isUpdating}
          className={`p-4 rounded-xl border transition-all text-left ${
            currentModel === 'gpt'
              ? 'bg-cyan-500/20 border-cyan-500/50 ring-2 ring-cyan-500/30'
              : 'bg-white/5 border-white/10 hover:bg-white/10'
          } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          data-testid="button-select-gpt"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              currentModel === 'gpt' ? 'bg-cyan-500/30' : 'bg-white/10'
            }`}>
              <Sparkles className={`w-5 h-5 ${
                currentModel === 'gpt' ? 'text-cyan-400' : 'text-white/50'
              }`} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">GPT-4o</div>
              <div className="text-xs text-white/50">OpenAI</div>
            </div>
            {currentModel === 'gpt' && (
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
            )}
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            Detailed, explanatory insights with comprehensive biomarker analysis
          </p>
        </button>

        {/* Grok-3-mini Option */}
        <button
          onClick={() => handleModelChange('grok')}
          disabled={isUpdating}
          className={`p-4 rounded-xl border transition-all text-left ${
            currentModel === 'grok'
              ? 'bg-purple-500/20 border-purple-500/50 ring-2 ring-purple-500/30'
              : 'bg-white/5 border-white/10 hover:bg-white/10'
          } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          data-testid="button-select-grok"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              currentModel === 'grok' ? 'bg-purple-500/30' : 'bg-white/10'
            }`}>
              <Zap className={`w-5 h-5 ${
                currentModel === 'grok' ? 'text-purple-400' : 'text-white/50'
              }`} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">Grok-3-mini</div>
              <div className="text-xs text-white/50">xAI</div>
            </div>
            {currentModel === 'grok' && (
              <div className="w-2 h-2 rounded-full bg-purple-400" />
            )}
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            Direct, pattern-focused insights with analytical data-driven tone
          </p>
        </button>
      </div>

      {isUpdating && (
        <div className="mt-4 flex items-center gap-2 text-xs text-cyan-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Updating AI model...</span>
        </div>
      )}

      <div className="mt-6 p-3 rounded-lg bg-white/5 border border-white/10">
        <p className="text-xs text-white/50">
          💡 <strong className="text-white/70">Tip:</strong> Test both models to compare insight quality and writing style. 
          The selected model will be used for all comprehensive health reports generated via the "See full report" button.
        </p>
      </div>
    </div>
  );
}

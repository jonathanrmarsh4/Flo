import { useState } from 'react';
import { Circle, Activity, Heart, ChevronRight, Loader2, Link2, Unlink, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { UserIntegration } from '@shared/schema';
import { DATA_SOURCE_DISPLAY_NAMES, DATA_SOURCE_COLORS, AVAILABLE_INTEGRATIONS } from '@shared/dataSource';

interface IntegrationsSettingsProps {
  isDark: boolean;
}

type IntegrationProvider = 'oura' | 'dexcom';

const INTEGRATION_ICONS: Record<IntegrationProvider, typeof Circle> = {
  oura: Circle, // Ring shape
  dexcom: Activity, // CGM activity line
};

const INTEGRATION_COLORS: Record<IntegrationProvider, { gradient: string; ring: string }> = {
  oura: { 
    gradient: 'from-cyan-500 to-teal-500', 
    ring: 'ring-cyan-500/30' 
  },
  dexcom: { 
    gradient: 'from-green-500 to-emerald-500', 
    ring: 'ring-green-500/30' 
  },
};

export function IntegrationsSettings({ isDark }: IntegrationsSettingsProps) {
  const { toast } = useToast();
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);
  
  // Fetch user's integrations
  const { data: integrations, isLoading } = useQuery<UserIntegration[]>({
    queryKey: ['/api/integrations'],
  });
  
  // Connect to integration (initiates OAuth flow)
  const connectMutation = useMutation({
    mutationFn: async (provider: IntegrationProvider) => {
      const response = await apiRequest('POST', `/api/integrations/${provider}/connect`);
      return response.json();
    },
    onSuccess: (data) => {
      // Redirect to OAuth authorization URL
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Could not initiate connection. Please try again.",
        variant: "destructive",
      });
      setConnectingProvider(null);
    },
  });
  
  // Disconnect integration
  const disconnectMutation = useMutation({
    mutationFn: async (provider: IntegrationProvider) => {
      await apiRequest('DELETE', `/api/integrations/${provider}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      toast({
        title: "Disconnected",
        description: "Integration has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnect Failed",
        description: error.message || "Could not disconnect. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Sync integration data manually
  const syncMutation = useMutation({
    mutationFn: async (provider: IntegrationProvider) => {
      await apiRequest('POST', `/api/integrations/${provider}/sync`);
    },
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      toast({
        title: "Sync Complete",
        description: `${DATA_SOURCE_DISPLAY_NAMES[provider]} data has been updated.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Could not sync data. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const handleConnect = (provider: IntegrationProvider) => {
    setConnectingProvider(provider);
    connectMutation.mutate(provider);
  };
  
  const handleDisconnect = (provider: IntegrationProvider) => {
    disconnectMutation.mutate(provider);
  };
  
  const handleSync = (provider: IntegrationProvider) => {
    syncMutation.mutate(provider);
  };
  
  const getIntegration = (provider: IntegrationProvider): UserIntegration | undefined => {
    return integrations?.find(i => i.provider === provider);
  };
  
  const getStatusBadge = (integration: UserIntegration | undefined) => {
    if (!integration || integration.status === 'not_connected') {
      return null;
    }
    
    const statusConfig = {
      connected: { 
        icon: Check, 
        text: 'Connected', 
        className: isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700' 
      },
      expired: { 
        icon: AlertCircle, 
        text: 'Expired', 
        className: isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700' 
      },
      error: { 
        icon: AlertCircle, 
        text: 'Error', 
        className: isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700' 
      },
    };
    
    const config = statusConfig[integration.status as keyof typeof statusConfig];
    if (!config) return null;
    
    const Icon = config.icon;
    return (
      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config.className}`}>
        <Icon className="w-3 h-3" />
        {config.text}
      </span>
    );
  };
  
  const formatLastSync = (date: Date | null | undefined): string => {
    if (!date) return 'Never synced';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
      isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
    }`} data-testid="card-integrations">
      <div className="flex items-center gap-2 mb-4">
        <Link2 className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
        <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Integrations
        </h2>
      </div>
      
      <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
        Connect your health devices for richer insights
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
        </div>
      ) : (
        <div className="space-y-3">
          {AVAILABLE_INTEGRATIONS.map((config) => {
            const provider = config.id as IntegrationProvider;
            const integration = getIntegration(provider);
            const isConnected = integration?.status === 'connected';
            const Icon = INTEGRATION_ICONS[provider];
            const colors = INTEGRATION_COLORS[provider];
            const isConnecting = connectingProvider === provider && connectMutation.isPending;
            const isSyncing = syncMutation.isPending && syncMutation.variables === provider;
            const isDisconnecting = disconnectMutation.isPending && disconnectMutation.variables === provider;
            
            return (
              <div
                key={provider}
                className={`rounded-2xl border p-4 transition-all ${
                  isDark 
                    ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                } ${isConnected ? `ring-1 ${colors.ring}` : ''}`}
                data-testid={`card-integration-${provider}`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Icon and Info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${colors.gradient}`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {config.name}
                        </h3>
                        {getStatusBadge(integration)}
                      </div>
                      <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        {config.description}
                      </p>
                      {isConnected && integration?.lastSyncAt && (
                        <p className={`text-xs mt-1 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                          Last synced: {formatLastSync(integration.lastSyncAt)}
                        </p>
                      )}
                      {integration?.lastSyncError && (
                        <p className="text-xs mt-1 text-red-400 truncate">
                          {integration.lastSyncError}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isConnected ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSync(provider)}
                          disabled={isSyncing}
                          className={isDark ? 'text-white/70 hover:text-white' : ''}
                          data-testid={`button-sync-${provider}`}
                        >
                          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDisconnect(provider)}
                          disabled={isDisconnecting}
                          className={`gap-1.5 ${
                            isDark 
                              ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' 
                              : 'border-red-300 text-red-600 hover:bg-red-50'
                          }`}
                          data-testid={`button-disconnect-${provider}`}
                        >
                          {isDisconnecting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Unlink className="w-3.5 h-3.5" />
                          )}
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(provider)}
                        disabled={isConnecting}
                        className={`gap-1.5 bg-gradient-to-r ${colors.gradient} text-white border-0 hover:opacity-90`}
                        data-testid={`button-connect-${provider}`}
                      >
                        {isConnecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" />
                        )}
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Capabilities preview */}
                {isConnected && (
                  <div className="mt-3 pt-3 border-t border-dashed border-white/10">
                    <p className={`text-xs mb-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                      Syncing:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {config.capabilities.slice(0, 5).map((cap) => (
                        <span
                          key={cap}
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            isDark ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {cap.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {config.capabilities.length > 5 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isDark ? 'bg-white/10 text-white/50' : 'bg-gray-100 text-gray-500'
                        }`}>
                          +{config.capabilities.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Apple Health note */}
      <div className={`mt-4 flex items-start gap-2 p-3 rounded-xl ${
        isDark ? 'bg-white/5' : 'bg-gray-50'
      }`}>
        <Heart className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
          Apple Health syncs automatically through the Flō iOS app.
        </p>
      </div>
    </div>
  );
}

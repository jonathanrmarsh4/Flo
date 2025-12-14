import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Send, BarChart3 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QueueStats {
  scheduled: number;
  processing: number;
  delivered: number;
  failed: number;
  skipped: number;
}

interface DeliveryStats {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number;
}

interface RecentDelivery {
  id: string;
  userId: string;
  type: string;
  title: string;
  success: boolean;
  devicesReached: number;
  errorMessage: string | null;
  attemptedAt: string;
  latencyMs: number | null;
}

export function AdminNotificationQueue() {
  const { toast } = useToast();

  const { data: queueStats, isLoading: queueLoading, refetch: refetchQueue } = useQuery<QueueStats>({
    queryKey: ['/api/admin/notifications/queue-stats'],
    refetchInterval: 10000,
  });

  const { data: deliveryStats, isLoading: deliveryLoading } = useQuery<DeliveryStats>({
    queryKey: ['/api/admin/notifications/delivery-stats'],
    refetchInterval: 30000,
  });

  const { data: recentDeliveries } = useQuery<RecentDelivery[]>({
    queryKey: ['/api/admin/notifications/recent-deliveries'],
    refetchInterval: 15000,
  });

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/notifications/retry-failed');
      return res.json();
    },
    onSuccess: (data: { count: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications/queue-stats'] });
      toast({
        title: 'Retrying Failed Notifications',
        description: `${data.count} failed notifications queued for retry`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to retry notifications',
        variant: 'destructive',
      });
    },
  });

  const processQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/notifications/process-queue');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications/queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications/recent-deliveries'] });
      toast({
        title: 'Queue Processing Triggered',
        description: 'Queue processor has been manually triggered',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-green-400" />
          Notification Queue Status
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetchQueue()}
            className="gap-1"
            data-testid="button-refresh-queue"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => processQueueMutation.mutate()}
            disabled={processQueueMutation.isPending}
            className="gap-1"
            data-testid="button-process-queue"
          >
            <Send className="w-4 h-4" />
            Process Now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              Scheduled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white" data-testid="text-scheduled-count">
              {queueLoading ? '-' : queueStats?.scheduled ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-yellow-400" />
              Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white" data-testid="text-processing-count">
              {queueLoading ? '-' : queueStats?.processing ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400" data-testid="text-delivered-count">
              {queueLoading ? '-' : queueStats?.delivered ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400" data-testid="text-failed-count">
              {queueLoading ? '-' : queueStats?.failed ?? 0}
            </div>
            {(queueStats?.failed ?? 0) > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => retryFailedMutation.mutate()}
                disabled={retryFailedMutation.isPending}
                className="mt-2 text-xs"
                data-testid="button-retry-failed"
              >
                Retry All
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              Skipped
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400" data-testid="text-skipped-count">
              {queueLoading ? '-' : queueStats?.skipped ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            Delivery Metrics (Last 24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-white/50">Total Attempts</div>
              <div className="text-xl font-semibold text-white" data-testid="text-total-attempts">
                {deliveryLoading ? '-' : deliveryStats?.total ?? 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-white/50">Successful</div>
              <div className="text-xl font-semibold text-green-400" data-testid="text-successful">
                {deliveryLoading ? '-' : deliveryStats?.successful ?? 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-white/50">Success Rate</div>
              <div className="text-xl font-semibold text-white" data-testid="text-success-rate">
                {deliveryLoading ? '-' : `${(deliveryStats?.successRate ?? 0).toFixed(1)}%`}
              </div>
            </div>
            <div>
              <div className="text-sm text-white/50">Avg Latency</div>
              <div className="text-xl font-semibold text-white" data-testid="text-avg-latency">
                {deliveryLoading ? '-' : `${deliveryStats?.avgLatencyMs ?? 0}ms`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white">Recent Deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDeliveries && recentDeliveries.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentDeliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                  data-testid={`row-delivery-${delivery.id}`}
                >
                  <div className="flex items-center gap-3">
                    {delivery.success ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <div>
                      <div className="text-sm text-white">{delivery.title}</div>
                      <div className="text-xs text-white/50">
                        {delivery.type} • {delivery.devicesReached} devices
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/70">
                      {new Date(delivery.attemptedAt).toLocaleTimeString()}
                    </div>
                    {delivery.latencyMs && (
                      <div className="text-xs text-white/50">{delivery.latencyMs}ms</div>
                    )}
                    {delivery.errorMessage && (
                      <div className="text-xs text-red-400 max-w-xs truncate">{delivery.errorMessage}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-white/50">No recent deliveries</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

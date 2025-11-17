import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { NotificationTrigger, InsertNotificationTrigger } from '@shared/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Bell, Plus, Trash2, Edit2, Save, X, AlertTriangle, Activity, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface NotificationTriggerWithBiomarker extends NotificationTrigger {
  biomarkerName?: string;
}

export function AdminNotificationConfig() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<NotificationTriggerWithBiomarker | null>(null);

  const [formData, setFormData] = useState<InsertNotificationTrigger>({
    triggerType: 'biomarker_out_of_range',
    isActive: true,
    title: '',
    body: '',
    biomarkerId: null,
    triggerConditions: {},
    createdBy: null,
  });

  const { data: triggers = [], isLoading } = useQuery<NotificationTriggerWithBiomarker[]>({
    queryKey: ['/api/admin/notification-triggers'],
  });

  const { data: biomarkersData, isLoading: isBiomarkersLoading } = useQuery<{ biomarkers: Array<{ id: string; name: string; category: string }> }>({
    queryKey: ['/api/biomarkers'],
  });

  // Extract biomarkers array from response object, ensuring it's always an array
  const biomarkers = biomarkersData?.biomarkers || [];

  const createMutation = useMutation({
    mutationFn: async (data: InsertNotificationTrigger) => {
      return await apiRequest('POST', '/api/admin/notification-triggers', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notification-triggers'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: 'Trigger Created',
        description: 'Notification trigger has been created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create trigger',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertNotificationTrigger> }) => {
      return await apiRequest('PATCH', `/api/admin/notification-triggers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notification-triggers'] });
      setEditingTrigger(null);
      toast({
        title: 'Trigger Updated',
        description: 'Notification trigger has been updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update trigger',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/admin/notification-triggers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notification-triggers'] });
      toast({
        title: 'Trigger Deleted',
        description: 'Notification trigger has been deleted',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete trigger',
        variant: 'destructive',
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest('PATCH', `/api/admin/notification-triggers/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notification-triggers'] });
    },
  });

  const resetForm = () => {
    setFormData({
      triggerType: 'biomarker_out_of_range',
      isActive: true,
      title: '',
      body: '',
      biomarkerId: null,
      triggerConditions: {},
      createdBy: null,
    });
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.body) {
      toast({
        title: 'Validation Error',
        description: 'Title and body are required',
        variant: 'destructive',
      });
      return;
    }

    if (editingTrigger) {
      updateMutation.mutate({
        id: editingTrigger.id,
        data: formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (trigger: NotificationTriggerWithBiomarker) => {
    setEditingTrigger(trigger);
    setFormData({
      triggerType: trigger.triggerType,
      isActive: trigger.isActive,
      title: trigger.title,
      body: trigger.body,
      biomarkerId: trigger.biomarkerId,
      triggerConditions: trigger.triggerConditions || {},
      createdBy: trigger.createdBy,
    });
    setIsCreateDialogOpen(true);
  };

  const getTriggerIcon = (type: string) => {
    switch (type) {
      case 'biomarker_out_of_range':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'biomarker_critical':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'flomentum_zone_change':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'ai_insight_generated':
        return <Sparkles className="h-4 w-4 text-purple-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTriggerTypeLabel = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Triggers
              </CardTitle>
              <CardDescription className="mt-1">
                Configure automatic notifications for health events
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setEditingTrigger(null);
                setIsCreateDialogOpen(true);
              }}
              size="sm"
              data-testid="button-create-trigger"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Trigger
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {triggers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No notification triggers configured</p>
                <p className="text-sm mt-1">Create your first trigger to start sending automated notifications</p>
              </div>
            ) : (
              triggers.map((trigger) => (
                <div
                  key={trigger.id}
                  className="flex items-start gap-3 p-4 rounded-lg border bg-card hover-elevate"
                  data-testid={`trigger-card-${trigger.id}`}
                >
                  <div className="mt-1">{getTriggerIcon(trigger.triggerType)}</div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{trigger.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{trigger.body}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch
                          checked={trigger.isActive}
                          onCheckedChange={(checked) => {
                            toggleActiveMutation.mutate({
                              id: trigger.id,
                              isActive: checked,
                            });
                          }}
                          data-testid={`toggle-active-${trigger.id}`}
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                        {getTriggerTypeLabel(trigger.triggerType)}
                      </span>
                      {trigger.biomarkerName && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {trigger.biomarkerName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(trigger)}
                      data-testid={`button-edit-${trigger.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this trigger?')) {
                          deleteMutation.mutate(trigger.id);
                        }
                      }}
                      data-testid={`button-delete-${trigger.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTrigger ? 'Edit Notification Trigger' : 'Create Notification Trigger'}
            </DialogTitle>
            <DialogDescription>
              Configure when and how users receive notifications
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Trigger Type */}
            <div className="space-y-2">
              <Label htmlFor="trigger-type">Trigger Type</Label>
              <Select
                value={formData.triggerType}
                onValueChange={(value: any) => setFormData({ ...formData, triggerType: value })}
              >
                <SelectTrigger id="trigger-type" data-testid="select-trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="biomarker_out_of_range">Biomarker Out of Range</SelectItem>
                  <SelectItem value="biomarker_critical">Biomarker Critical</SelectItem>
                  <SelectItem value="flomentum_zone_change">Flōmentum Zone Change</SelectItem>
                  <SelectItem value="ai_insight_generated">AI Insight Generated</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Biomarker Selection (for biomarker triggers) */}
            {(formData.triggerType === 'biomarker_out_of_range' || formData.triggerType === 'biomarker_critical') && (
              <div className="space-y-2">
                <Label htmlFor="biomarker">Biomarker</Label>
                <Select
                  value={formData.biomarkerId || ''}
                  onValueChange={(value) => setFormData({ ...formData, biomarkerId: value || null })}
                >
                  <SelectTrigger id="biomarker" data-testid="select-biomarker">
                    <SelectValue placeholder="Select a biomarker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Biomarkers</SelectItem>
                    {biomarkers.map((biomarker) => (
                      <SelectItem key={biomarker.id} value={biomarker.id}>
                        {biomarker.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leave blank to trigger for any biomarker that meets the condition
                </p>
              </div>
            )}

            {/* Notification Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Notification Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., LDL Cholesterol Alert"
                data-testid="input-title"
              />
            </div>

            {/* Notification Body */}
            <div className="space-y-2">
              <Label htmlFor="body">Notification Body</Label>
              <Textarea
                id="body"
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="e.g., Your LDL cholesterol is outside the healthy range. Review your results."
                rows={3}
                data-testid="textarea-body"
              />
              <p className="text-xs text-muted-foreground">
                Tip: Use clear, actionable language. Variables like biomarker name and value will be added automatically.
              </p>
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label htmlFor="is-active" className="font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">Enable this trigger immediately</p>
              </div>
              <Switch
                id="is-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="toggle-is-active"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingTrigger(null);
                resetForm();
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>Saving...</>
              ) : editingTrigger ? (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Update Trigger
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Trigger
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

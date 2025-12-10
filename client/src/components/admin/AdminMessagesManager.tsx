import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageSquare, Send, Bug, Lightbulb, Users, Trash2, 
  Check, Clock, AlertCircle, Archive, Eye, Loader2, Bell
} from 'lucide-react';
import { AdminNotificationConfig } from './AdminNotificationConfig';

interface DeveloperMessage {
  id: number;
  title: string;
  message: string;
  type: 'update' | 'outage' | 'feature';
  targetUserIds: string[] | null;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
}

interface UserFeedback {
  id: number;
  userId: string;
  type: 'bug_report' | 'feature_request';
  title: string | null;
  message: string;
  status: 'new' | 'in_review' | 'planned' | 'resolved' | 'dismissed';
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  userEmail: string | null;
  userName: string | null;
}

interface UserOption {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

type TabType = 'compose' | 'sent' | 'bugs' | 'features' | 'triggers';

export function AdminMessagesManager() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('compose');
  
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'update' | 'outage' | 'feature'>('update');
  const [targetType, setTargetType] = useState<'all' | 'specific'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [sendPush, setSendPush] = useState(false);
  
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'new' | 'in_review'>('all');
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ messages: DeveloperMessage[] }>({
    queryKey: ['/api/admin/developer-messages'],
  });

  const { data: feedbackData, isLoading: feedbackLoading } = useQuery<{ feedback: UserFeedback[] }>({
    queryKey: ['/api/admin/user-feedback'],
  });

  const { data: usersData } = useQuery<{ users: UserOption[] }>({
    queryKey: ['/api/admin/users-list'],
  });

  const messages = messagesData?.messages || [];
  const feedback = feedbackData?.feedback || [];
  const users = usersData?.users || [];

  const bugReports = feedback.filter(f => f.type === 'bug_report');
  const featureRequests = feedback.filter(f => f.type === 'feature_request');

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { title: string; message: string; type: string; targetUserIds?: string[]; sendPush?: boolean }) => {
      return apiRequest('POST', '/api/admin/developer-messages', data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/developer-messages'] });
      setTitle('');
      setMessage('');
      setMessageType('update');
      setTargetType('all');
      setSelectedUserIds([]);
      setSendPush(false);
      
      const pushResults = response?.pushResults;
      if (pushResults) {
        toast({
          title: 'Message Sent with Push',
          description: `Message sent. Push notifications: ${pushResults.sent} delivered, ${pushResults.failed} failed.`,
        });
      } else {
        toast({
          title: 'Message Sent',
          description: 'Your message has been sent to users',
        });
      }
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/developer-messages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/developer-messages'] });
      toast({
        title: 'Message Deleted',
        description: 'Message has been removed',
      });
    },
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: number; status?: string; adminNotes?: string }) => {
      return apiRequest('PATCH', `/api/admin/user-feedback/${id}`, { status, adminNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/user-feedback'] });
      setExpandedFeedback(null);
      setAdminNotes('');
      toast({
        title: 'Feedback Updated',
        description: 'Status has been updated',
      });
    },
  });

  const handleSendMessage = () => {
    if (!title.trim() || !message.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Title and message are required',
        variant: 'destructive',
      });
      return;
    }

    sendMessageMutation.mutate({
      title: title.trim(),
      message: message.trim(),
      type: messageType,
      targetUserIds: targetType === 'specific' && selectedUserIds.length > 0 ? selectedUserIds : undefined,
      sendPush,
    });
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">New</Badge>;
      case 'in_review':
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">In Review</Badge>;
      case 'planned':
        return <Badge variant="secondary" className="bg-purple-500/20 text-purple-400">Planned</Badge>;
      case 'resolved':
        return <Badge variant="secondary" className="bg-green-500/20 text-green-400">Resolved</Badge>;
      case 'dismissed':
        return <Badge variant="secondary" className="bg-gray-500/20 text-gray-400">Dismissed</Badge>;
      default:
        return null;
    }
  };

  const getMessageTypeBadge = (type: string) => {
    switch (type) {
      case 'update':
        return <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400">Update</Badge>;
      case 'outage':
        return <Badge variant="secondary" className="bg-amber-500/20 text-amber-400">Outage</Badge>;
      case 'feature':
        return <Badge variant="secondary" className="bg-green-500/20 text-green-400">Feature</Badge>;
      default:
        return null;
    }
  };

  const filteredBugs = feedbackFilter === 'all' 
    ? bugReports 
    : bugReports.filter(b => b.status === feedbackFilter);
  
  const filteredFeatures = feedbackFilter === 'all'
    ? featureRequests
    : featureRequests.filter(f => f.status === feedbackFilter);

  const tabs = [
    { id: 'compose' as TabType, label: 'Compose', icon: Send, count: null },
    { id: 'sent' as TabType, label: 'Sent', icon: MessageSquare, count: messages.length },
    { id: 'bugs' as TabType, label: 'Bug Reports', icon: Bug, count: bugReports.filter(b => b.status === 'new').length },
    { id: 'features' as TabType, label: 'Feature Requests', icon: Lightbulb, count: featureRequests.filter(f => f.status === 'new').length },
    { id: 'triggers' as TabType, label: 'Push Triggers', icon: Bell, count: null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-white/10 rounded text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'compose' && (
        <Card className="bg-white/5 backdrop-blur-xl border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Send className="h-5 w-5" />
              Send In-App Message
            </CardTitle>
            <CardDescription className="text-white/60">
              Compose a message to send to all users or specific users
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Message Type</Label>
              <Select value={messageType} onValueChange={(v: any) => setMessageType(v)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-message-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="update">Update - App updates and releases</SelectItem>
                  <SelectItem value="outage">Outage - Maintenance or issues</SelectItem>
                  <SelectItem value="feature">Feature - New feature announcements</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Recipients</Label>
              <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-recipients">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="specific">Specific Users</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetType === 'specific' && (
              <div className="space-y-2">
                <Label className="text-white/70">Select Users ({selectedUserIds.length} selected)</Label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2 space-y-1">
                  {users.map(user => (
                    <label 
                      key={user.id} 
                      className="flex items-center gap-2 p-2 rounded hover:bg-white/5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => handleUserSelect(user.id)}
                        className="rounded border-white/20"
                      />
                      <span className="text-white/80 text-sm">
                        {user.email}
                        {user.firstName && ` (${user.firstName})`}
                      </span>
                      <Badge variant="outline" className="ml-auto text-xs">
                        {user.role}
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-white/70">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Message title..."
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                data-testid="input-message-title"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message here..."
                rows={5}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
                data-testid="input-message-body"
              />
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/5">
              <input
                type="checkbox"
                id="send-push"
                checked={sendPush}
                onChange={(e) => setSendPush(e.target.checked)}
                className="rounded border-white/20 w-5 h-5"
                data-testid="checkbox-send-push"
              />
              <label htmlFor="send-push" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-cyan-400" />
                  <span className="text-white">Send Push Notification</span>
                </div>
                <p className="text-white/50 text-sm mt-1">
                  Users will receive "Important update from Flo" on their devices
                </p>
              </label>
            </div>

            <Button
              onClick={handleSendMessage}
              disabled={sendMessageMutation.isPending}
              className="w-full bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500"
              data-testid="button-send-message"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Message
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'sent' && (
        <Card className="bg-white/5 backdrop-blur-xl border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <MessageSquare className="h-5 w-5" />
              Sent Messages
            </CardTitle>
            <CardDescription className="text-white/60">
              View and manage messages sent to users
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messagesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-white/50">
                No messages sent yet
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map(msg => (
                  <div 
                    key={msg.id}
                    className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium">{msg.title}</span>
                          {getMessageTypeBadge(msg.type)}
                          {msg.targetUserIds ? (
                            <Badge variant="outline" className="text-xs">
                              <Users className="w-3 h-3 mr-1" />
                              {msg.targetUserIds.length} users
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">All users</Badge>
                          )}
                        </div>
                        <p className="text-white/60 text-sm mt-1">{msg.message}</p>
                        <p className="text-white/40 text-xs mt-2">
                          {new Date(msg.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMessageMutation.mutate(msg.id)}
                        className="text-white/50 hover:text-red-400 hover:bg-red-500/10"
                        data-testid={`button-delete-message-${msg.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(activeTab === 'bugs' || activeTab === 'features') && (
        <Card className="bg-white/5 backdrop-blur-xl border-white/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  {activeTab === 'bugs' ? <Bug className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
                  {activeTab === 'bugs' ? 'Bug Reports' : 'Feature Requests'}
                </CardTitle>
                <CardDescription className="text-white/60">
                  {activeTab === 'bugs' 
                    ? 'Review and respond to user bug reports' 
                    : 'Review feature requests from users'}
                </CardDescription>
              </div>
              <Select value={feedbackFilter} onValueChange={(v: any) => setFeedbackFilter(v)}>
                <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {feedbackLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
              </div>
            ) : (activeTab === 'bugs' ? filteredBugs : filteredFeatures).length === 0 ? (
              <div className="text-center py-8 text-white/50">
                No {activeTab === 'bugs' ? 'bug reports' : 'feature requests'} found
              </div>
            ) : (
              <div className="space-y-3">
                {(activeTab === 'bugs' ? filteredBugs : filteredFeatures).map(item => (
                  <div 
                    key={item.id}
                    className="p-4 rounded-lg border border-white/10 bg-white/5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.title && (
                            <span className="text-white font-medium">{item.title}</span>
                          )}
                          {getStatusBadge(item.status)}
                        </div>
                        <p className="text-white/60 text-sm mt-1">{item.message}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                          <span>From: {item.userEmail || 'Unknown'}</span>
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                        {item.adminNotes && (
                          <div className="mt-2 p-2 rounded bg-white/5 border border-white/10">
                            <p className="text-xs text-white/50">Admin notes:</p>
                            <p className="text-sm text-white/70">{item.adminNotes}</p>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setExpandedFeedback(expandedFeedback === item.id ? null : item.id);
                          setAdminNotes(item.adminNotes || '');
                        }}
                        className="text-white/50 hover:text-white"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>

                    {expandedFeedback === item.id && (
                      <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                        <div className="space-y-2">
                          <Label className="text-white/70 text-sm">Update Status</Label>
                          <div className="flex gap-2 flex-wrap">
                            {['new', 'in_review', 'planned', 'resolved', 'dismissed'].map(status => (
                              <Button
                                key={status}
                                size="sm"
                                variant={item.status === status ? 'default' : 'outline'}
                                onClick={() => updateFeedbackMutation.mutate({ id: item.id, status })}
                                className="text-xs"
                              >
                                {status.replace('_', ' ')}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-white/70 text-sm">Admin Notes</Label>
                          <Textarea
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            placeholder="Add internal notes..."
                            rows={2}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => updateFeedbackMutation.mutate({ id: item.id, adminNotes })}
                            disabled={updateFeedbackMutation.isPending}
                          >
                            Save Notes
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'triggers' && (
        <AdminNotificationConfig />
      )}
    </div>
  );
}

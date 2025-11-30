import { Bell, ChevronLeft, Bug, Lightbulb, MessageSquare, Image, Send, Check, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface NotificationsScreenProps {
  isDark: boolean;
  onClose: () => void;
}

type TabType = 'messages' | 'bug' | 'feature';

interface DeveloperMessage {
  id: number;
  title: string;
  message: string;
  type: 'update' | 'outage' | 'feature';
  isRead: boolean;
  createdAt: string;
}

export function NotificationsScreen({ isDark, onClose }: NotificationsScreenProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('messages');
  
  const [bugMessage, setBugMessage] = useState('');
  const [bugScreenshot, setBugScreenshot] = useState<File | null>(null);
  const [bugSubmitted, setBugSubmitted] = useState(false);
  
  const [featureTitle, setFeatureTitle] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [featureSubmitted, setFeatureSubmitted] = useState(false);

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ messages: DeveloperMessage[] }>({
    queryKey: ['/api/notifications/messages'],
  });

  const messages = messagesData?.messages || [];
  const unreadCount = messages.filter(m => !m.isRead).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      return apiRequest('POST', `/api/notifications/messages/${messageId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/messages'] });
    },
  });

  const submitBugMutation = useMutation({
    mutationFn: async (data: { message: string }) => {
      return apiRequest('POST', '/api/notifications/bug-report', data);
    },
    onSuccess: () => {
      setBugSubmitted(true);
      setTimeout(() => {
        setBugMessage('');
        setBugScreenshot(null);
        setBugSubmitted(false);
      }, 3000);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to submit bug report. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const submitFeatureMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      return apiRequest('POST', '/api/notifications/feature-request', data);
    },
    onSuccess: () => {
      setFeatureSubmitted(true);
      setTimeout(() => {
        setFeatureTitle('');
        setFeatureDescription('');
        setFeatureSubmitted(false);
      }, 3000);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to submit feature request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleBugSubmit = () => {
    if (bugMessage.trim()) {
      submitBugMutation.mutate({ message: bugMessage });
    }
  };

  const handleFeatureSubmit = () => {
    if (featureTitle.trim() && featureDescription.trim()) {
      submitFeatureMutation.mutate({ title: featureTitle, description: featureDescription });
    }
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBugScreenshot(e.target.files[0]);
    }
  };

  const markAsRead = (id: number) => {
    markAsReadMutation.mutate(id);
  };

  const getMessageTypeColor = (type: DeveloperMessage['type']) => {
    switch (type) {
      case 'update':
        return isDark ? 'text-cyan-400' : 'text-cyan-600';
      case 'outage':
        return isDark ? 'text-amber-400' : 'text-amber-600';
      case 'feature':
        return isDark ? 'text-green-400' : 'text-green-600';
    }
  };

  const getMessageTypeBg = (type: DeveloperMessage['type']) => {
    switch (type) {
      case 'update':
        return isDark ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200';
      case 'outage':
        return isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200';
      case 'feature':
        return isDark ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-200';
    }
  };

  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b pt-[env(safe-area-inset-top)] ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={onClose}
              className={`flex items-center gap-2 text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-notifications-back"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <Bell className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Notifications</h1>
              {unreadCount > 0 && (
                <div className={`px-2 py-0.5 rounded-full text-xs ${
                  isDark ? 'bg-cyan-500 text-white' : 'bg-cyan-600 text-white'
                }`}>
                  {unreadCount}
                </div>
              )}
            </div>
            <div className="w-12" />
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className={`inline-flex rounded-xl p-1 ${
            isDark ? 'bg-white/5' : 'bg-gray-100'
          }`}>
            <button
              onClick={() => setActiveTab('messages')}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                activeTab === 'messages'
                  ? isDark 
                    ? 'bg-cyan-500 text-white shadow-lg' 
                    : 'bg-cyan-600 text-white shadow-lg'
                  : isDark
                    ? 'text-white/60 hover:text-white/80'
                    : 'text-gray-600 hover:text-gray-800'
              }`}
              data-testid="tab-messages"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Messages
                {unreadCount > 0 && activeTab !== 'messages' && (
                  <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('bug')}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                activeTab === 'bug'
                  ? isDark 
                    ? 'bg-cyan-500 text-white shadow-lg' 
                    : 'bg-cyan-600 text-white shadow-lg'
                  : isDark
                    ? 'text-white/60 hover:text-white/80'
                    : 'text-gray-600 hover:text-gray-800'
              }`}
              data-testid="tab-bug"
            >
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Report Bug
              </div>
            </button>
            <button
              onClick={() => setActiveTab('feature')}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                activeTab === 'feature'
                  ? isDark 
                    ? 'bg-cyan-500 text-white shadow-lg' 
                    : 'bg-cyan-600 text-white shadow-lg'
                  : isDark
                    ? 'text-white/60 hover:text-white/80'
                    : 'text-gray-600 hover:text-gray-800'
              }`}
              data-testid="tab-feature"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Request Feature
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="h-full overflow-y-auto pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6">
          
          {activeTab === 'messages' && (
            <div className="space-y-4">
              <div className={`mb-6 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                <p className="text-sm">
                  Stay updated with important announcements, new features, and system updates.
                </p>
              </div>

              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
                </div>
              ) : messages.length === 0 ? (
                <div className={`backdrop-blur-xl rounded-3xl border p-12 text-center ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-gray-200'
                }`}>
                  <Bell className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-white/30' : 'text-gray-300'}`} />
                  <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    No messages yet. We'll notify you of important updates here.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    onClick={() => !message.isRead && markAsRead(message.id)}
                    className={`backdrop-blur-xl rounded-3xl border p-6 transition-all cursor-pointer ${
                      isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/80 border-gray-200 hover:bg-white'
                    } ${!message.isRead ? 'shadow-lg' : ''}`}
                    data-testid={`message-${message.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {message.title}
                          </h3>
                          {!message.isRead && (
                            <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                          )}
                        </div>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {new Date(message.createdAt).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs border ${getMessageTypeBg(message.type)}`}>
                        <span className={getMessageTypeColor(message.type)}>
                          {message.type.charAt(0).toUpperCase() + message.type.slice(1)}
                        </span>
                      </div>
                    </div>
                    <p className={`text-sm leading-relaxed ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      {message.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'bug' && (
            <div className={`backdrop-blur-xl rounded-3xl border p-8 ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-gray-200'
            }`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-3 rounded-2xl ${
                  isDark ? 'bg-red-500/20' : 'bg-red-100'
                }`}>
                  <Bug className={`w-6 h-6 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                </div>
                <div>
                  <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Report a Bug
                  </h2>
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Help us improve Flō by reporting issues
                  </p>
                </div>
              </div>

              {bugSubmitted ? (
                <div className={`p-6 rounded-2xl border text-center ${
                  isDark 
                    ? 'bg-green-500/10 border-green-500/20' 
                    : 'bg-green-50 border-green-200'
                }`}>
                  <Check className={`w-12 h-12 mx-auto mb-3 ${
                    isDark ? 'text-green-400' : 'text-green-600'
                  }`} />
                  <h3 className={`mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Bug Report Submitted
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Thank you for helping us improve Flō. We'll look into this right away.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Describe the bug *
                    </label>
                    <textarea
                      value={bugMessage}
                      onChange={(e) => setBugMessage(e.target.value)}
                      placeholder="What happened? What were you trying to do?"
                      rows={6}
                      className={`w-full px-4 py-3 rounded-xl border text-sm resize-none ${
                        isDark 
                          ? 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600'
                      }`}
                      data-testid="input-bug-message"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Screenshot (optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleScreenshotUpload}
                      className="hidden"
                      id="bug-screenshot"
                    />
                    <label
                      htmlFor="bug-screenshot"
                      className={`flex items-center justify-center gap-3 w-full px-4 py-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                        isDark 
                          ? 'bg-white/5 border-white/10 hover:border-cyan-500/50 hover:bg-white/10' 
                          : 'bg-white border-gray-300 hover:border-cyan-600/50 hover:bg-gray-50'
                      }`}
                    >
                      <Image className={`w-5 h-5 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                      <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        {bugScreenshot ? bugScreenshot.name : 'Click to upload screenshot'}
                      </span>
                    </label>
                    {bugScreenshot && (
                      <button
                        onClick={() => setBugScreenshot(null)}
                        className={`mt-2 text-sm ${isDark ? 'text-red-400' : 'text-red-600'} hover:underline`}
                      >
                        Remove screenshot
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleBugSubmit}
                    disabled={!bugMessage.trim() || submitBugMutation.isPending}
                    className={`w-full py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
                      bugMessage.trim() && !submitBugMutation.isPending
                        ? isDark 
                          ? 'bg-cyan-500 text-white hover:bg-cyan-600' 
                          : 'bg-cyan-600 text-white hover:bg-cyan-700'
                        : isDark
                          ? 'bg-white/10 text-white/30 cursor-not-allowed'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                    data-testid="button-submit-bug"
                  >
                    {submitBugMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {submitBugMutation.isPending ? 'Submitting...' : 'Submit Bug Report'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'feature' && (
            <div className={`backdrop-blur-xl rounded-3xl border p-8 ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-gray-200'
            }`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-3 rounded-2xl ${
                  isDark ? 'bg-purple-500/20' : 'bg-purple-100'
                }`}>
                  <Lightbulb className={`w-6 h-6 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <div>
                  <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Request a Feature
                  </h2>
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Share your ideas to make Flō better
                  </p>
                </div>
              </div>

              {featureSubmitted ? (
                <div className={`p-6 rounded-2xl border text-center ${
                  isDark 
                    ? 'bg-green-500/10 border-green-500/20' 
                    : 'bg-green-50 border-green-200'
                }`}>
                  <Check className={`w-12 h-12 mx-auto mb-3 ${
                    isDark ? 'text-green-400' : 'text-green-600'
                  }`} />
                  <h3 className={`mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Feature Request Submitted
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    We love your enthusiasm! We'll review your suggestion and consider it for future updates.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Feature Title *
                    </label>
                    <input
                      type="text"
                      value={featureTitle}
                      onChange={(e) => setFeatureTitle(e.target.value)}
                      placeholder="Give your feature request a clear title"
                      className={`w-full px-4 py-3 rounded-xl border text-sm ${
                        isDark 
                          ? 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600'
                      }`}
                      data-testid="input-feature-title"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Description *
                    </label>
                    <textarea
                      value={featureDescription}
                      onChange={(e) => setFeatureDescription(e.target.value)}
                      placeholder="Describe the feature and how it would benefit you..."
                      rows={8}
                      className={`w-full px-4 py-3 rounded-xl border text-sm resize-none ${
                        isDark 
                          ? 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600'
                      }`}
                      data-testid="input-feature-description"
                    />
                  </div>

                  <button
                    onClick={handleFeatureSubmit}
                    disabled={!featureTitle.trim() || !featureDescription.trim() || submitFeatureMutation.isPending}
                    className={`w-full py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
                      featureTitle.trim() && featureDescription.trim() && !submitFeatureMutation.isPending
                        ? isDark 
                          ? 'bg-cyan-500 text-white hover:bg-cyan-600' 
                          : 'bg-cyan-600 text-white hover:bg-cyan-700'
                        : isDark
                          ? 'bg-white/10 text-white/30 cursor-not-allowed'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                    data-testid="button-submit-feature"
                  >
                    {submitFeatureMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {submitFeatureMutation.isPending ? 'Submitting...' : 'Submit Feature Request'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

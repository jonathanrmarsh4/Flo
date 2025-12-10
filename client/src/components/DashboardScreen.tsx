import { FloOverviewTile } from './dashboard/FloOverviewTile';
import { HeartMetabolicTile } from './dashboard/HeartMetabolicTile';
import { BodyCompositionTile } from './dashboard/BodyCompositionTile';
import { ReadinessTile } from './dashboard/ReadinessTile';
import { SleepTile } from './dashboard/SleepTile';
import { FlomentumGamifiedTile } from './dashboard/FlomentumGamifiedTile';
import { UpgradePremiumTile } from './dashboard/UpgradePremiumTile';
import { AirQualityTile } from './dashboard/AirQualityTile';
import { AnomalyAlertTile } from './dashboard/AnomalyAlertTile';
import { MorningBriefingTile } from './dashboard/MorningBriefingTile';
import { AIInsightsTile } from './AIInsightsTile';
import { FloLogo } from './FloLogo';
import { ThreePMSurveyModal } from './ThreePMSurveyModal';
import { FeedbackSurveyModal } from './FeedbackSurveyModal';
import { Settings, Brain, TrendingUp, Shield, Sun, Moon, LogOut, GripVertical, Bell, ClipboardCheck, MessageCircle, AlertTriangle, ThermometerSnowflake, HeartPulse } from 'lucide-react';
import { NotificationsScreen } from './NotificationsScreen';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { RAGInsightsScreen } from './RAGInsightsScreen';
import { LockedTile } from './LockedTile';
import { PaywallModal } from './PaywallModal';
import { usePlan, usePaywallModals } from '@/hooks/usePlan';
import { useAuth } from '@/hooks/useAuth';
import { Capacitor } from '@capacitor/core';
import { queryClient } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTileOrder, type TileId } from '@/hooks/useTileOrder';

interface DashboardScreenProps {
  isDark: boolean;
  onSettingsClick?: () => void;
  onThemeToggle?: () => void;
  onLogout?: () => void;
  onTalkToFlo?: (context?: string) => void;
}

// Sortable wrapper component for tiles
interface SortableItemProps {
  id: TileId;
  isDark: boolean;
  children: React.ReactNode;
}

function SortableItem({ id, isDark, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [isPressingHandle, setIsPressingHandle] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Track handle press to prevent tile clicks during/after handle interaction
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsPressingHandle(true);
    e.stopPropagation();
    e.preventDefault();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // Delay reset to prevent immediate clicks
    setTimeout(() => {
      setIsPressingHandle(false);
    }, 150);
    e.stopPropagation();
    e.preventDefault();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // Prevent clicks on tile content when handle is being pressed or dragging
  const handleContentClick = (e: React.MouseEvent) => {
    if (isPressingHandle || isDragging) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const handleContentPointerUp = (e: React.PointerEvent) => {
    if (isPressingHandle || isDragging) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        className={`absolute top-2 right-2 z-10 p-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-colors ${
          isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
        }`}
        data-testid={`drag-handle-${id}`}
      >
        <GripVertical className={`w-4 h-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
      </div>
      {/* Content wrapper to catch bubbled events */}
      <div 
        onClick={handleContentClick}
        onPointerUp={handleContentPointerUp}
      >
        {children}
      </div>
    </div>
  );
}

interface PendingFeedbackAlert {
  feedbackId: string;
  questionText: string;
  questionType: 'scale_1_10' | 'yes_no' | 'multiple_choice' | 'open_ended';
  options?: string[];
  triggerPattern: string;
  triggerMetrics: Record<string, { value: number; deviation: number }>;
  urgency: 'low' | 'medium' | 'high';
  createdAt: string;
  expiresAt: string;
}

const DISMISSED_FEEDBACK_KEY = 'flo-dismissed-ml-feedback';

export function DashboardScreen({ isDark, onSettingsClick, onThemeToggle, onLogout, onTalkToFlo }: DashboardScreenProps) {
  const [, setLocation] = useLocation();
  const [showInsights, setShowInsights] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<PendingFeedbackAlert | null>(null);
  const [paywallModalId, setPaywallModalId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { user } = useAuth();
  const { tileOrder, reorderTiles} = useTileOrder();
  
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data: surveyTodayData } = useQuery<{ completed: boolean; survey: any }>({
    queryKey: [`/api/surveys/today?timezone=${encodeURIComponent(timezone)}`],
  });
  
  const { data: dashboardData, isLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/overview'],
  });
  
  const { data: notificationCountData } = useQuery<{ unreadCount: number }>({
    queryKey: ['/api/notifications/unread-count'],
  });

  const { data: pendingFeedbackData } = useQuery<{ alerts: PendingFeedbackAlert[] }>({
    queryKey: ['/api/anomaly-alerts/pending'],
    refetchInterval: 60000,
  });

  const { data: planData } = usePlan();
  const { data: paywallModalsData } = usePaywallModals();

  const getDismissedFeedbackIds = (): string[] => {
    try {
      const stored = localStorage.getItem(DISMISSED_FEEDBACK_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const dismissFeedback = (feedbackId: string) => {
    try {
      const dismissed = getDismissedFeedbackIds();
      if (!dismissed.includes(feedbackId)) {
        dismissed.push(feedbackId);
        localStorage.setItem(DISMISSED_FEEDBACK_KEY, JSON.stringify(dismissed.slice(-50)));
      }
    } catch {}
  };


  const handleFeedbackClose = () => {
    setShowFeedbackModal(false);
    setCurrentFeedback(null);
  };

  const handleFeedbackSubmit = () => {
    if (currentFeedback) {
      dismissFeedback(currentFeedback.feedbackId);
    }
    setShowFeedbackModal(false);
    setCurrentFeedback(null);
    queryClient.invalidateQueries({ queryKey: ['/api/anomaly-alerts/pending'] });
  };
  
  const canAccessInsights = planData?.features?.insights?.allowAiGeneratedInsightCards ?? true;
  const canAccessFlomentum = planData?.features?.flomentum?.allowFlomentumScoring ?? true;

  // Configure sensors for drag and drop - optimized for touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms hold required for touch drag
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tileOrder.indexOf(active.id as TileId);
      const newIndex = tileOrder.indexOf(over.id as TileId);
      
      const newOrder = arrayMove(tileOrder, oldIndex, newIndex);
      reorderTiles(newOrder);
    }

    // Delay resetting isDragging to prevent click handlers from firing
    setTimeout(() => {
      setIsDragging(false);
    }, 100);
  };

  const handleDragCancel = () => {
    setTimeout(() => {
      setIsDragging(false);
    }, 100);
  };

  const handleUpgrade = () => {
    setLocation('/billing');
  };

  const handleLogout = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
        await SecureStoragePlugin.remove({ key: 'auth_token' });
        logger.debug('JWT token cleared from secure storage on logout');
      } catch (error) {
        logger.error('Failed to clear auth token on logout', error);
      }
      
      queryClient.clear();
      setLocation('/mobile-auth');
    } else {
      window.location.href = '/api/logout';
    }
  };

  // Find the current paywall modal by ID
  const currentPaywallModal = paywallModalId && paywallModalsData?.modals 
    ? paywallModalsData.modals.find(m => m.id === paywallModalId)
    : undefined;

  const { data: bioAgeData } = useQuery<any>({
    queryKey: ['/api/biological-age'],
  });

  const { data: sleepData } = useQuery<any>({
    queryKey: ['/api/sleep/today'],
  });

  // Render individual tiles based on ID (Morning Briefing is now above Flō Overview, not sortable)
  const renderTile = (tileId: TileId) => {
    const tileContent = (() => {
      switch (tileId) {
        case 'heart-metabolic':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              <HeartMetabolicTile 
                isDark={isDark}
                score={dashboardData?.componentScores?.cardiometabolic}
                riskBand={dashboardData?.details?.cardiometabolicDetails?.riskBand}
                glycemicScore={dashboardData?.details?.cardiometabolicDetails?.glycemicScore}
                lipidsScore={dashboardData?.details?.cardiometabolicDetails?.lipidsScore}
                bloodPressureScore={dashboardData?.details?.cardiometabolicDetails?.bloodPressureScore}
                cacScore={dashboardData?.details?.cardiometabolicDetails?.cacScore}
              />
            </SortableItem>
          );

        case 'body-composition':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              <BodyCompositionTile isDark={isDark} />
            </SortableItem>
          );

        case 'flomentum':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              {canAccessFlomentum ? (
                <FlomentumGamifiedTile 
                  isDark={isDark} 
                  onClick={() => {
                    if (!isDragging) {
                      setLocation('/flomentum');
                    }
                  }} 
                />
              ) : (
                <UpgradePremiumTile
                  isDark={isDark}
                  onUpgrade={() => {
                    if (!isDragging) {
                      setPaywallModalId('upgrade_on_locked_flomentum_tile');
                    }
                  }}
                />
              )}
            </SortableItem>
          );

        case 'readiness':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              <ReadinessTile isDark={isDark} />
            </SortableItem>
          );

        case 'sleep':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              <SleepTile isDark={isDark} data={sleepData} />
            </SortableItem>
          );

        case 'insights':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              {canAccessInsights ? (
                <AIInsightsTile />
              ) : (
                <LockedTile
                  title="AI Insights"
                  description="Get intelligent pattern detection and health insights"
                  icon={Brain}
                  onUpgrade={() => {
                    if (!isDragging) {
                      setPaywallModalId('upgrade_on_locked_insights_tile');
                    }
                  }}
                  isDark={isDark}
                />
              )}
            </SortableItem>
          );

        default:
          return null;
      }
    })();

    return tileContent;
  };

  return (
    <div className={`flex-1 overflow-y-auto overscroll-none pb-24 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-colors pt-[env(safe-area-inset-top)] ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FloLogo size={32} />
              <div>
                <h1 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Dashboard
                </h1>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Your health at a glance
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user?.role === 'admin' && (
                <button 
                  onClick={() => setLocation('/admin')}
                  className={`p-2 rounded-lg transition-colors ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                  }`}
                  data-testid="button-admin"
                >
                  <Shield className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                </button>
              )}
              <button 
                onClick={() => setShowSurveyModal(true)}
                className={`p-2 rounded-lg transition-colors relative ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                } ${surveyTodayData?.completed ? 'opacity-50' : ''}`}
                data-testid="button-daily-checkin"
                disabled={surveyTodayData?.completed}
              >
                <ClipboardCheck className={`w-5 h-5 ${
                  surveyTodayData?.completed 
                    ? (isDark ? 'text-green-400' : 'text-green-600')
                    : (isDark ? 'text-cyan-400' : 'text-cyan-600')
                }`} />
                {!surveyTodayData?.completed && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                )}
              </button>
              <button 
                onClick={() => setShowNotifications(true)}
                className={`p-2 rounded-lg transition-colors relative ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-notifications"
              >
                <Bell className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                {(notificationCountData?.unreadCount ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium text-white bg-cyan-500 rounded-full">
                    {notificationCountData?.unreadCount ?? 0}
                  </span>
                )}
              </button>
              <button 
                onClick={onThemeToggle}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-theme-toggle"
              >
                {isDark ? (
                  <Sun className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                ) : (
                  <Moon className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                )}
              </button>
              <button 
                onClick={onSettingsClick}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-settings"
              >
                <Settings className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
              <button 
                onClick={onLogout || handleLogout}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-logout"
              >
                <LogOut className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Air Quality Tile - Fixed below header */}
      <AirQualityTile isDark={isDark} />

      {/* Dashboard Content */}
      <main className="px-4 py-6 space-y-4 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Loading dashboard...
            </div>
          </div>
        ) : (
          <>
            {/* ML Feedback Question Banner - Shows when there's a pending question */}
            {pendingFeedbackData?.alerts && pendingFeedbackData.alerts.length > 0 && (() => {
              const dismissed = getDismissedFeedbackIds();
              const availableAlert = pendingFeedbackData.alerts.find(
                alert => !dismissed.includes(alert.feedbackId)
              );
              if (!availableAlert) return null;
              
              const PatternIcon = availableAlert.triggerPattern === 'illness_precursor' 
                ? ThermometerSnowflake 
                : availableAlert.triggerPattern === 'elevated_rhr' 
                  ? HeartPulse 
                  : AlertTriangle;
              
              const urgencyColors = {
                high: 'from-red-500/20 to-orange-500/20 border-red-400/30',
                medium: 'from-orange-500/20 to-yellow-500/20 border-orange-400/30',
                low: 'from-blue-500/20 to-cyan-500/20 border-blue-400/30',
              };
              
              return (
                <button
                  onClick={() => {
                    setCurrentFeedback(availableAlert);
                    setShowFeedbackModal(true);
                  }}
                  className={`w-full backdrop-blur-xl rounded-2xl border p-4 transition-all hover:scale-[1.01] active:scale-[0.99] ${
                    isDark 
                      ? `bg-gradient-to-r ${urgencyColors[availableAlert.urgency]} border-white/10` 
                      : `bg-gradient-to-r ${urgencyColors[availableAlert.urgency]} border-black/10`
                  }`}
                  data-testid="banner-ml-feedback"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-white/10' : 'bg-black/5'}`}>
                      <PatternIcon className={`w-5 h-5 ${
                        availableAlert.urgency === 'high' ? 'text-red-400' : 
                        availableAlert.urgency === 'medium' ? 'text-orange-400' : 'text-blue-400'
                      }`} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium uppercase tracking-wide ${
                          availableAlert.urgency === 'high' ? 'text-red-400' : 
                          availableAlert.urgency === 'medium' ? 'text-orange-400' : 'text-blue-400'
                        }`}>
                          {availableAlert.urgency === 'high' ? 'Health Alert' : 
                           availableAlert.urgency === 'medium' ? 'Check-In' : 'Quick Question'}
                        </span>
                      </div>
                      <p className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {availableAlert.questionText.length > 80 
                          ? availableAlert.questionText.substring(0, 77) + '...' 
                          : availableAlert.questionText}
                      </p>
                      <div className="flex items-center gap-1 mt-2">
                        <MessageCircle className={`w-3 h-3 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                        <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          Tap to respond
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })()}

            {/* Anomaly Alert Tile - Shows when ML detects a health pattern */}
            <AnomalyAlertTile isDark={isDark} />

            {/* Morning Briefing Tile - Shows 7am-12pm above Flō Overview */}
            <MorningBriefingTile isDark={isDark} useMetric={true} onTalkToFlo={onTalkToFlo} />

            {/* Hero Tile - Flō Overview (Locked at top, not draggable) */}
            <FloOverviewTile 
              isDark={isDark}
              bioAge={bioAgeData?.biologicalAge}
              calendarAge={bioAgeData?.chronologicalAge}
              bioAgeDelta={bioAgeData?.ageDifference}
              floScore={dashboardData?.floScore}
              cardiometabolic={dashboardData?.componentScores?.cardiometabolic}
              bodyComposition={dashboardData?.componentScores?.bodyComposition}
              readiness={dashboardData?.componentScores?.readiness}
              inflammation={dashboardData?.componentScores?.inflammation}
              lastCheckin={dashboardData?.lastUpdated}
              missingMetrics={bioAgeData?.missingBiomarkers}
            />

            {/* Sortable Tiles */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={tileOrder} strategy={verticalListSortingStrategy}>
                {tileOrder.map((tileId) => renderTile(tileId))}
              </SortableContext>
            </DndContext>
          </>
        )}
      </main>

      {/* RAG Insights Modal */}
      {showInsights && canAccessInsights && (
        <RAGInsightsScreen isDark={isDark} onClose={() => setShowInsights(false)} />
      )}

      {/* Paywall Modal */}
      {currentPaywallModal && (
        <PaywallModal
          open={!!paywallModalId}
          onOpenChange={(open) => !open && setPaywallModalId(null)}
          modal={currentPaywallModal}
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Notifications Screen */}
      {showNotifications && (
        <NotificationsScreen 
          isDark={isDark} 
          onClose={() => setShowNotifications(false)} 
        />
      )}

      {/* 3PM Daily Survey Modal */}
      <ThreePMSurveyModal
        isOpen={showSurveyModal}
        onClose={() => setShowSurveyModal(false)}
        isDark={isDark}
      />

      {/* ML Feedback Question Modal */}
      {showFeedbackModal && currentFeedback && (
        <FeedbackSurveyModal
          feedbackId={currentFeedback.feedbackId}
          question={{
            questionText: currentFeedback.questionText,
            questionType: currentFeedback.questionType,
            options: currentFeedback.options,
            triggerPattern: currentFeedback.triggerPattern,
            triggerMetrics: currentFeedback.triggerMetrics,
            urgency: currentFeedback.urgency,
          }}
          isDark={isDark}
          onClose={handleFeedbackClose}
          onSubmit={handleFeedbackSubmit}
        />
      )}
    </div>
  );
}

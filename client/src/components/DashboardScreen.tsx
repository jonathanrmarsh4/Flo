import { FloOverviewTile } from './dashboard/FloOverviewTile';
import { HeartMetabolicTile } from './dashboard/HeartMetabolicTile';
import { BodyCompositionTile } from './dashboard/BodyCompositionTile';
import { ReadinessTile } from './dashboard/ReadinessTile';
import { SleepTile } from './dashboard/SleepTile';
import { FlomentumTile } from './dashboard/FlomentumTile';
import { AIInsightsTile } from './AIInsightsTile';
import { FloLogo } from './FloLogo';
import { Settings, Brain, TrendingUp, Shield, Sun, Moon, LogOut, GripVertical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useState } from 'react';
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

export function DashboardScreen({ isDark, onSettingsClick, onThemeToggle, onLogout }: DashboardScreenProps) {
  const [, setLocation] = useLocation();
  const [showInsights, setShowInsights] = useState(false);
  const [paywallModalId, setPaywallModalId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { user } = useAuth();
  const { tileOrder, reorderTiles} = useTileOrder();
  
  const { data: dashboardData, isLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/overview'],
  });

  const { data: planData } = usePlan();
  const { data: paywallModalsData } = usePaywallModals();
  
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

  // Render individual tiles based on ID
  const renderTile = (tileId: TileId) => {
    const tileContent = (() => {
      switch (tileId) {
        case 'health-metrics':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <HeartMetabolicTile 
                  isDark={isDark}
                  score={dashboardData?.componentScores?.cardiometabolic}
                  riskBand={dashboardData?.details?.cardiometabolicDetails?.riskBand}
                  glycemicScore={dashboardData?.details?.cardiometabolicDetails?.glycemicScore}
                  lipidsScore={dashboardData?.details?.cardiometabolicDetails?.lipidsScore}
                  bloodPressureScore={dashboardData?.details?.cardiometabolicDetails?.bloodPressureScore}
                  cacScore={dashboardData?.details?.cardiometabolicDetails?.cacScore}
                />
                <BodyCompositionTile isDark={isDark} />
              </div>
            </SortableItem>
          );

        case 'flomentum':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              {canAccessFlomentum ? (
                <FlomentumTile 
                  isDark={isDark} 
                  onClick={() => {
                    if (!isDragging) {
                      setLocation('/flomentum');
                    }
                  }} 
                />
              ) : (
                <LockedTile
                  title="Flōmentum"
                  description="Track your daily health momentum with AI-powered scoring"
                  icon={TrendingUp}
                  onUpgrade={() => {
                    if (!isDragging) {
                      setPaywallModalId('upgrade_on_locked_flomentum_tile');
                    }
                  }}
                  isDark={isDark}
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

        case 'quick-stats':
          return (
            <SortableItem key={tileId} id={tileId} isDark={isDark}>
              <div className="grid grid-cols-2 gap-4">
                <QuickStatCard
                  label="Data Points"
                  value="247"
                  trend="+12 this week"
                  isDark={isDark}
                />
                <QuickStatCard
                  label="Streak"
                  value="28d"
                  trend="Personal best!"
                  isDark={isDark}
                />
              </div>
            </SortableItem>
          );

        default:
          return null;
      }
    })();

    return tileContent;
  };

  return (
    <div className={`min-h-screen pb-24 overscroll-none ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-colors ${
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
    </div>
  );
}

interface QuickStatCardProps {
  label: string;
  value: string;
  trend: string;
  isDark: boolean;
}

function QuickStatCard({ label, value, trend, isDark }: QuickStatCardProps) {
  return (
    <div className={`backdrop-blur-xl rounded-2xl border p-4 transition-all ${
      isDark 
        ? 'bg-white/5 border-white/10' 
        : 'bg-white/60 border-black/10'
    }`}>
      <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className={`text-2xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {value}
      </div>
      <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
        {trend}
      </div>
    </div>
  );
}

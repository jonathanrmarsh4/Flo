# Flō UI Component Map

A comprehensive reference document for design AI consumption, mapping all UI components to their data sources, API endpoints, and interaction patterns.

---

## Table of Contents
1. [Design System Overview](#design-system-overview)
2. [Page Structure & Navigation](#page-structure--navigation)
3. [Dashboard Tiles](#dashboard-tiles)
4. [Screen Components](#screen-components)
5. [Data Fetching Hooks](#data-fetching-hooks)
6. [API Endpoints Reference](#api-endpoints-reference)
7. [Shared UI Components](#shared-ui-components)

---

## Design System Overview

### Design Philosophy
- **System**: Apple Human Interface Guidelines (HIG)
- **Approach**: Mobile-first iOS app with trust, clarity, and clean data presentation
- **Theme**: Dark/Light mode support via CSS variables

### Complete Color Token Reference

#### Light Mode (`:root`)
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `0 0% 100%` | Page backgrounds |
| `--foreground` | `0 0% 10%` | Primary text |
| `--border` | `0 0% 90%` | Default borders |
| `--card` | `0 0% 98%` | Card backgrounds |
| `--card-foreground` | `0 0% 10%` | Card text |
| `--card-border` | `0 0% 94%` | Card borders |
| `--sidebar` | `0 0% 97%` | Sidebar background |
| `--sidebar-foreground` | `0 0% 15%` | Sidebar text |
| `--sidebar-border` | `0 0% 92%` | Sidebar borders |
| `--sidebar-primary` | `211 100% 50%` | Sidebar primary actions |
| `--sidebar-primary-foreground` | `0 0% 100%` | Sidebar primary text |
| `--sidebar-accent` | `0 0% 94%` | Sidebar accent |
| `--sidebar-accent-foreground` | `0 0% 15%` | Sidebar accent text |
| `--sidebar-ring` | `211 100% 50%` | Sidebar focus ring |
| `--popover` | `0 0% 98%` | Popover background |
| `--popover-foreground` | `0 0% 10%` | Popover text |
| `--popover-border` | `0 0% 92%` | Popover borders |
| `--primary` | `211 100% 50%` | Primary actions, links |
| `--primary-foreground` | `0 0% 100%` | Primary text |
| `--secondary` | `0 0% 96%` | Secondary elements |
| `--secondary-foreground` | `0 0% 15%` | Secondary text |
| `--muted` | `0 0% 94%` | Muted backgrounds |
| `--muted-foreground` | `0 0% 40%` | Secondary/muted text |
| `--accent` | `0 0% 96%` | Accent backgrounds |
| `--accent-foreground` | `0 0% 15%` | Accent text |
| `--destructive` | `0 84% 60%` | Error/delete actions |
| `--destructive-foreground` | `0 0% 100%` | Destructive text |
| `--success` | `142 71% 45%` | Success states |
| `--success-foreground` | `0 0% 100%` | Success text |
| `--warning` | `45 93% 47%` | Warning states |
| `--warning-foreground` | `0 0% 100%` | Warning text |
| `--error` | `0 84% 60%` | Error states |
| `--error-foreground` | `0 0% 100%` | Error text |
| `--input` | `0 0% 70%` | Input borders |
| `--ring` | `211 100% 50%` | Focus rings |
| `--chart-1` | `211 100% 50%` | Chart color 1 (blue) |
| `--chart-2` | `142 71% 45%` | Chart color 2 (green) |
| `--chart-3` | `48 96% 53%` | Chart color 3 (yellow) |
| `--chart-4` | `280 87% 65%` | Chart color 4 (purple) |
| `--chart-5` | `0 84% 60%` | Chart color 5 (red) |

#### Dark Mode (`.dark`)
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `222 47% 11%` | Page backgrounds |
| `--foreground` | `0 0% 95%` | Primary text |
| `--border` | `0 0% 18%` | Default borders |
| `--card` | `0 0% 12%` | Card backgrounds |
| `--card-foreground` | `0 0% 95%` | Card text |
| `--card-border` | `0 0% 16%` | Card borders |
| `--sidebar` | `0 0% 10%` | Sidebar background |
| `--sidebar-foreground` | `0 0% 90%` | Sidebar text |
| `--sidebar-border` | `0 0% 15%` | Sidebar borders |
| `--sidebar-primary` | `211 100% 60%` | Sidebar primary actions |
| `--sidebar-accent` | `0 0% 15%` | Sidebar accent |
| `--sidebar-accent-foreground` | `0 0% 90%` | Sidebar accent text |
| `--popover` | `0 0% 12%` | Popover background |
| `--popover-foreground` | `0 0% 95%` | Popover text |
| `--popover-border` | `0 0% 18%` | Popover borders |
| `--primary` | `211 100% 60%` | Primary actions |
| `--primary-foreground` | `0 0% 100%` | Primary text |
| `--secondary` | `0 0% 18%` | Secondary elements |
| `--secondary-foreground` | `0 0% 90%` | Secondary text |
| `--muted` | `0 0% 16%` | Muted backgrounds |
| `--muted-foreground` | `0 0% 60%` | Muted text |
| `--accent` | `0 0% 15%` | Accent backgrounds |
| `--accent-foreground` | `0 0% 90%` | Accent text |
| `--success` | `142 71% 50%` | Success states |
| `--warning` | `45 93% 60%` | Warning states |
| `--input` | `0 0% 35%` | Input borders |
| `--ring` | `211 100% 60%` | Focus rings |
| `--chart-1` | `211 100% 65%` | Chart color 1 |
| `--chart-2` | `142 71% 55%` | Chart color 2 |
| `--chart-3` | `48 96% 60%` | Chart color 3 |
| `--chart-4` | `280 87% 70%` | Chart color 4 |
| `--chart-5` | `0 84% 65%` | Chart color 5 |

#### Flō Brand Colors
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--flo-gradient-start` | `222 84% 5%` | `215 78% 12%` | Gradient start |
| `--flo-gradient-mid` | `222 84% 15%` | `215 78% 20%` | Gradient mid |
| `--flo-gradient-end` | `222 84% 5%` | `215 78% 12%` | Gradient end |
| `--flo-teal` | `173 80% 40%` | `173 80% 55%` | Accent teal |
| `--flo-cyan` | `189 94% 43%` | `189 94% 58%` | Accent cyan |
| `--flo-purple` | `258 90% 66%` | `258 90% 75%` | Accent purple |

#### Interaction Utilities
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--button-outline` | `rgba(0,0,0, .10)` | `rgba(255,255,255, .10)` | Button outlines |
| `--badge-outline` | `rgba(0,0,0, .05)` | `rgba(255,255,255, .05)` | Badge outlines |
| `--elevate-1` | `rgba(0,0,0, .03)` | `rgba(255,255,255, .04)` | Hover elevation |
| `--elevate-2` | `rgba(0,0,0, .08)` | `rgba(255,255,255, .09)` | Active elevation |

#### Shadow System
| Token | Value (Light) | Usage |
|-------|---------------|-------|
| `--shadow-2xs` | `0px 1px 2px 0px hsl(0 0% 0% / 0.05)` | Minimal shadow |
| `--shadow-xs` | `0px 1px 3px 0px hsl(0 0% 0% / 0.10)` | Extra small |
| `--shadow-sm` | `0px 2px 4px 0px hsl(0 0% 0% / 0.08)` | Small |
| `--shadow` | `0px 4px 6px -1px hsl(0 0% 0% / 0.10)` | Default |
| `--shadow-md` | `0px 6px 12px -2px hsl(0 0% 0% / 0.12)` | Medium |
| `--shadow-lg` | `0px 10px 20px -5px hsl(0 0% 0% / 0.15)` | Large |
| `--shadow-xl` | `0px 20px 25px -5px hsl(0 0% 0% / 0.20)` | Extra large |
| `--shadow-2xl` | `0px 25px 50px -12px hsl(0 0% 0% / 0.25)` | 2X large |

### Typography
| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Large Title | 34pt | Bold | Screen headers |
| Title 1 | 28pt | Regular | Section headers, biological age |
| Title 2 | 22pt | Semibold | Metric labels, card headers |
| Body | 17pt | Regular | Primary content |
| Callout | 16pt | Regular | Secondary information |
| Caption | 12pt | Regular | Timestamps, metadata |

**Font Stack**: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

### Spacing System
- **Base unit**: `--spacing: 0.25rem` (4px)
- **Border radius**: `--radius: 0.75rem` (12px)
- **Screen padding**: `px-4` (16px)
- **Card spacing**: `p-6` internal, `mb-4` between cards
- **Section gaps**: `space-y-8`
- **Component spacing**: `gap-4`
- **Letter spacing**: `--tracking-normal: -0.01em`

---

## Page Structure & Navigation

### App Entry Point
**File**: `client/src/App.tsx`

#### Routes
| Path | Component | Description |
|------|-----------|-------------|
| `/` | `Dashboard` | Main dashboard (authenticated) or `Landing` |
| `/auth` | `MobileAuth` | Authentication screen |
| `/labs` | `Labs` | Blood work & biomarker data |
| `/insights` | `InsightsScreen` | AI-powered insights |
| `/actions` | `ActionsScreen` | Recommended actions |
| `/report` | `Report` | Full health report |
| `/upload` | `UploadPage` | File upload for labs |
| `/history` | `History` | Historical data |
| `/results` | `Results` | Test results |
| `/profile` | `Profile` | User profile settings |
| `/diagnostics` | `DiagnosticsPage` | Diagnostic tests |
| `/activity` | `ActivityPage` | Activity tracking |
| `/healthkit` | `HealthKitPage` | HealthKit integration |
| `/flomentum` | `FlomentumScreen` | Flōmentum score details |
| `/billing` | `BillingPage` | Subscription management |
| `/shortcuts` | `ShortcutsPage` | Siri shortcuts |
| `/sleep-logger` | `SleepLogger` | Manual sleep logging |
| `/admin` | `AdminDashboard` | Admin panel (admin only) |
| `/admin-users` | `AdminUsers` | User management (admin only) |
| `/assessment/new` | `NewAssessmentWizard` | New N=1 experiment |
| `/assessment/:id` | `AssessmentDetail` | Experiment details |

### Bottom Navigation
**File**: `client/src/components/FloBottomNav.tsx`

| Tab | Icon | Route | Description |
|-----|------|-------|-------------|
| Dashboard | Home | `/` | Main dashboard |
| Labs | FlaskConical | `/labs` | Blood work |
| Activity | Activity | `/activity` | Activity metrics |
| Flō Oracle | Brain | Voice chat | AI assistant |
| Profile | User | `/profile` | Settings |

---

## Dashboard Tiles

### 1. FloOverviewTile
**File**: `client/src/components/dashboard/FloOverviewTile.tsx`

| Property | Value |
|----------|-------|
| Data Source | Props (passed from parent DashboardScreen) |
| Props | `bioAge, calendarAge, bioAgeDelta, floScore, cardiometabolic, bodyComposition, readiness, inflammation, lastCheckin, missingMetrics, onWhyClick` |
| Purpose | Display biological vs chronological age comparison and overall Flō score |
| User Interactions | Tap "Why" button for explanation |
| Test ID | `tile-flo-overview` |

### 2. SleepTile
**File**: `client/src/components/dashboard/SleepTile.tsx`

| Property | Value |
|----------|-------|
| Primary Data | Props (`data: HealthKitSleepData`) passed from DashboardScreen (via `/api/sleep/today`) |
| Fallback Query | `['/api/sleep/manual']` - only fetched when `!data || data.nightflo_score === null` |
| Data Shape | `HealthKitSleepData { nightflo_score, score_label, score_delta_vs_baseline, trend_direction, total_sleep_duration, time_in_bed, sleep_efficiency_pct, deep_sleep_pct, rem_sleep_pct, bedtime_local, waketime_local, headline_insight, source }` |
| Manual Shape | `ManualSleepEntry { id, sleep_date, bedtime, wake_time, duration_minutes, quality_rating, nightflo_score, score_label, notes }` |
| Purpose | Display last night's sleep quality and metrics |
| User Interactions | Tap to navigate to `/sleep-logger`, add manual entry |
| States | Empty (no data), HealthKit data, Manual data |
| Test ID | `tile-sleep-empty`, `tile-sleep` |

### 3. ReadinessTile
**File**: `client/src/components/dashboard/ReadinessTile.tsx`

| Property | Value |
|----------|-------|
| Query Key | `['/api/readiness/today']` |
| Data Shape | `ReadinessData { readinessScore, readinessBucket ('recover'|'ok'|'ready'), sleepScore, recoveryScore, loadScore, trendScore, isCalibrating, explanations, metrics, keyFactors, timestamp }` |
| Purpose | Daily readiness score based on sleep, recovery, activity |
| User Interactions | View details, "Why" button explanation |
| Cache Config | `staleTime: 2min, gcTime: 10min` |
| Test ID | `tile-readiness` |

### 4. FlomentumGamifiedTile
**File**: `client/src/components/dashboard/FlomentumGamifiedTile.tsx`

| Property | Value |
|----------|-------|
| Query Key | `['/api/flomentum/today']` |
| Invalidates | `['/api/flomentum/today']` on mutation |
| Data Shape | Gamified health consistency score with streaks |
| Purpose | Display streak-based health consistency motivation |
| User Interactions | Tap to view Flōmentum details screen |

### 5. FlomentumTile (Alternative)
**File**: `client/src/components/dashboard/FlomentumTile.tsx`

| Property | Value |
|----------|-------|
| Query Key | `['/api/flomentum/today']` |
| Purpose | Simpler Flōmentum score display |

### 6. HeartMetabolicTile
**File**: `client/src/components/dashboard/HeartMetabolicTile.tsx`

| Property | Value |
|----------|-------|
| Data Source | Props (passed from parent DashboardScreen) |
| Props | `score, riskBand, glycemicScore, lipidsScore, bloodPressureScore, cacScore` |
| Purpose | Display heart and metabolic health scores |
| User Interactions | View detailed breakdown |
| Test ID | `tile-heart-metabolic` |

### 7. BodyCompositionTile
**File**: `client/src/components/dashboard/BodyCompositionTile.tsx`

| Property | Value |
|----------|-------|
| Query Key | `['/v1/weight/tile']` (no /api prefix) |
| Cache Config | `staleTime: 5min, gcTime: 15min` |
| Data Shape | `WeightTileResponse { user_id, generated_at_utc, status_chip ('ON_TRACK'|'AHEAD'|'BEHIND'|'STALE'|'NEEDS_DATA'), confidence_level ('HIGH'|'MEDIUM'|'LOW'), current_weight_kg, delta_vs_7d_avg_kg, body_fat_pct, lean_mass_kg, goal: { configured, goal_type, target_weight_kg, target_date_local }, progress_percent, forecast: { horizon_days, weight_low_kg_at_horizon, weight_high_kg_at_horizon, eta_weeks, eta_uncertainty_weeks }, source: { label, last_sync_relative, staleness_days } }` |
| Purpose | Display weight and body composition with goal progress and forecast |
| User Interactions | Tap to view WeightModuleScreen, view goal progress, see forecast |
| Test ID | `tile-body-composition`, `tile-body-composition-loading` |

### 8. MorningBriefingTile
**File**: `client/src/components/dashboard/MorningBriefingTile.tsx`

| Property | Value |
|----------|-------|
| Query Key | `['/api/briefing/today']` |
| Data Shape | `MorningBriefingData { briefing_id, event_date, readiness_score, sleep_data, recent_activity, recommendation, weather, greeting, readiness_insight, sleep_insight }` |
| Purpose | Personalized AI-generated morning health summary |
| User Interactions | Expand to read full briefing, give feedback, talk to Flō |
| Visibility | Shows between 7 AM - 12 PM local time |

### 9. AirQualityTile
**File**: `client/src/components/dashboard/AirQualityTile.tsx`

| Property | Value |
|----------|-------|
| Query Key | `['/api/environmental/today']` |
| Data Shape | Air quality index, PM2.5, PM10, humidity, temperature |
| Purpose | Display local air quality and environmental data |
| User Interactions | Tap for detailed environmental view |

### 10. CGMTile
**File**: `client/src/components/dashboard/CGMTile.tsx`

| Property | Value |
|----------|-------|
| Query Keys | `['/api/dexcom/status']`, `['/api/dexcom/readings', { hours: 24 }]` |
| Data Shape | `CGMStatus { connected, isSandbox, connectedAt, lastSyncAt, syncStatus, errorMessage }`, `CGMReadingsResponse { readings[], latest, timeInRange, hours }` |
| Purpose | Display continuous glucose monitor data from Dexcom |
| User Interactions | Connect Dexcom, sync data, view glucose trends |
| Cache Config | `staleTime: 1min, refetchInterval: 5min` |
| Invalidates | `['/api/dexcom/readings']`, `['/api/dexcom/status']` on sync |

### 11. AnomalyAlertTile
**File**: `client/src/components/dashboard/AnomalyAlertTile.tsx`

| Property | Value |
|----------|-------|
| Query Key | `['/api/anomaly-alerts/pending']` |
| Invalidates | `['/api/anomaly-alerts/pending']`, `['/api/user/insights']` on feedback submission |
| Data Shape | ML-detected anomalies with causal analysis |
| Purpose | Display health anomalies requiring user feedback |
| User Interactions | Respond to survey, provide feedback, dismiss |

### 12. AIInsightsTile
**File**: `client/src/components/AIInsightsTile.tsx`

| Property | Value |
|----------|-------|
| Query Key | `['/api/daily-insights']` |
| Purpose | Display AI-generated daily health insights |
| User Interactions | Tap to view full insights screen |

### 13. UpgradePremiumTile
**File**: `client/src/components/dashboard/UpgradePremiumTile.tsx`

| Property | Value |
|----------|-------|
| Data Source | Uses `usePlan` hook internally |
| Purpose | Upsell premium subscription to free users |
| User Interactions | Tap to view pricing, subscribe |
| Visibility | Only shown to free tier users |

---

## Screen Components

### DashboardScreen
**File**: `client/src/components/DashboardScreen.tsx`

| Property | Value |
|----------|-------|
| Purpose | Main dashboard container with reorderable tiles |
| Features | Drag-and-drop tile reordering (dnd-kit), theme toggle, settings access |
| State Management | Tile order persisted via `useTileOrder` hook |
| Child Components | All dashboard tiles, ThreePMSurveyModal, FeedbackSurveyModal, WhyModal, PaywallModal |

### VoiceChatScreen (Flō Oracle)
**File**: `client/src/components/VoiceChatScreen.tsx`

| Property | Value |
|----------|-------|
| API Endpoints | `/api/oracle/chat`, `/api/oracle/voice` |
| Purpose | Voice-activated AI health coach |
| Features | Voice input (ElevenLabs), text input, conversation history |
| Dependencies | ElevenLabs (voice synthesis), Gemini (AI) |

### ProfileScreen
**File**: `client/src/components/ProfileScreen.tsx`

| Property | Value |
|----------|-------|
| API Endpoints | `/api/profile`, `/api/auth/user` |
| Query Keys | `['/api/profile']`, `['/api/auth/user']` |
| Purpose | User settings, demographics, preferences |
| Sections | Demographics, Health baseline, Goals, AI personalization, Notifications |

### ActivityScreen
**File**: `client/src/components/ActivityScreen.tsx`

| Property | Value |
|----------|-------|
| Purpose | Activity and workout tracking display |
| Data | Steps, active energy, workouts, exercise minutes |

---

## Data Fetching Hooks

### useAuth
**File**: `client/src/hooks/useAuth.ts`
| Query Key | `['/api/auth/user']` |
| Returns | `User` object with id, email, plan, isAdmin |

### useProfile
**File**: `client/src/hooks/useProfile.ts`
| Hook | Query Key | Invalidates |
|------|-----------|-------------|
| `useProfile()` | `['/api/profile']` | - |
| `useUpdateDemographics()` | - | `['/api/profile']`, `['/api/biomarkers']` |
| `useUpdateHealthBaseline()` | - | `['/api/profile']`, `['/api/biomarkers']` |
| `useUpdateGoals()` | - | `['/api/profile']`, `['/api/biomarkers']` |
| `useUpdateAIPersonalization()` | - | `['/api/profile']`, `['/api/biomarkers']` |
| `useUpdateReminderPreferences()` | - | `['/api/auth/user']` |
| `useBodyFatCalibration()` | `['/api/profile/body-fat-calibration']` | - |
| `useUpdateBodyFatCalibration()` | - | `['/api/profile/body-fat-calibration']`, `['/v1/weight/tile']`, `['/v1/weight/overview']` |
| `useUpdateName()` | - | `['/api/auth/user']` |

### usePlan
**File**: `client/src/hooks/usePlan.ts`
| Hook | Query Key | Returns |
|------|-----------|---------|
| `usePlan()` | `['/api/billing/plan']` | `{ plan, isPremium, canUploadLab }` |
| `usePaywallModals()` | `['/api/billing/paywall-modals']` | Paywall configuration |
| `useBillingPlans()` | `['/api/billing/plans']` | Available subscription plans |

### useTileOrder
**File**: `client/src/hooks/useTileOrder.ts`
| Property | Value |
|----------|-------|
| Purpose | Persist dashboard tile order |
| Storage | localStorage (`flo-dashboard-tile-order` key) |
| Sortable Tiles | `heart-metabolic`, `body-composition`, `flomentum`, `readiness`, `sleep`, `insights` |
| Default Order | `flomentum` → `insights` → `sleep` → `readiness` → `heart-metabolic` → `body-composition` |
| Returns | `{ tileOrder: TileId[], reorderTiles: (order) => void, resetToDefault: () => void }` |
| Notes | Validates stored order against current tile IDs; auto-resets if tiles added/removed |

### usePendingFeedback
**File**: `client/src/hooks/usePendingFeedback.ts`
| Property | Value |
|----------|-------|
| Query Key | None (localStorage-driven, no API queries) |
| Purpose | Manage ML feedback survey modal state and cooldowns |
| Storage Keys | `flo-dismissed-feedback` (dismissed IDs), `flo-feedback-cooldown` (24h cooldown) |
| Cooldown | 24 hours after submission or dismissal |
| Data Shape | `PendingFeedback { feedbackId, question: FeedbackQuestion, createdAt }` |
| Question Types | `scale_1_10`, `yes_no`, `multiple_choice`, `open_ended` |
| Triggers | Push notifications via `triggerFromPushNotification()`, or direct call via `showFeedbackModal()` |
| Returns | `{ isModalOpen, currentFeedback, showFeedbackModal, closeFeedbackModal, handleSubmit, triggerFromPushNotification, isInCooldown }` |

### useHealthKitAutoSync
**File**: `client/src/hooks/useHealthKitAutoSync.ts`
| Purpose | Automatic background HealthKit data synchronization |
| Invalidates on sync | `['/api/environmental']` |
| Refetches on sync | `['/api/dashboard/overview']`, `['/api/biological-age']`, `['/api/sleep/today']`, `['/api/readiness/today']`, `['/api/flomentum/today']`, `['/api/flomentum/weekly']`, `['/api/environmental/today']` |

### useTimezoneAutoSync
**File**: `client/src/hooks/useTimezoneAutoSync.ts`
| Purpose | Automatically sync device timezone for accurate scheduling |

### useUnitDisplayMode
**File**: `client/src/hooks/useUnitDisplayMode.ts`
| Purpose | Toggle between metric/imperial units |

### useGeminiLiveVoice
**File**: `client/src/hooks/useGeminiLiveVoice.ts`
| Purpose | Gemini Live API voice interaction for Flō Oracle |

---

## API Endpoints Reference

### Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/auth/user` | Get current user |
| GET | `/api/auth/ws-token` | Get WebSocket token |
| DELETE | `/api/user/data` | Delete all user data |

### Profile
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/profile` | Get user profile |
| PATCH | `/api/profile/demographics` | Update demographics |
| PATCH | `/api/profile/baseline` | Update health baseline |
| PATCH | `/api/profile/goals` | Update health goals |
| PATCH | `/api/profile/personalization` | Update AI personalization |
| PATCH | `/api/profile/reminder-preferences` | Update notification preferences |
| GET/PATCH | `/api/profile/body-fat-calibration` | Body fat calibration |
| PATCH | `/api/profile/name` | Update display name |
| GET/PATCH | `/api/profile/voice-preference` | Voice preference |
| GET/PATCH | `/api/user/timezone` | User timezone |

### Blood Work & Biomarkers
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/blood-work/analyze` | Analyze uploaded lab PDF |
| GET | `/api/blood-work/latest` | Get latest blood work |
| GET | `/api/blood-work` | Get all blood work history |
| GET | `/api/blood-work/:id` | Get specific blood work |
| GET | `/api/biomarkers` | Get all biomarker data |
| GET | `/api/biomarker-sessions` | Get biomarker sessions |
| GET | `/api/biological-age` | Get calculated biological age |
| GET | `/api/lab-work-overdue` | Check overdue lab work |
| GET | `/api/biomarkers/top-to-improve` | Top biomarkers to improve |
| GET | `/api/biomarkers/:id/units` | Get biomarker units |
| GET | `/api/biomarkers/:id/reference-range` | Get reference range |

### Health Insights & Reports
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/daily-insights` | Get daily insights |
| GET/POST | `/api/health-insights` | Health insights |
| GET | `/api/comprehensive-report` | Full health report |
| GET | `/api/health-summary-report` | Summary report |
| GET | `/api/briefing/today` | Morning briefing |

### HealthKit & Metrics
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/sleep/today` | Today's sleep data |
| GET | `/api/sleep/manual` | Manual sleep entries |
| GET | `/api/readiness/today` | Readiness score |
| GET | `/api/flomentum/today` | Today's Flōmentum |
| GET | `/api/flomentum/weekly` | Weekly Flōmentum |
| GET | `/api/environmental/today` | Environmental data |
| GET | `/v1/weight/tile` | Weight tile data (no /api prefix) |
| GET | `/v1/weight/overview` | Weight overview (no /api prefix) |
| GET | `/api/dashboard/overview` | Dashboard overview |

### CGM (Dexcom Integration)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/dexcom/status` | Dexcom connection status |
| GET | `/api/dexcom/readings` | Glucose readings |
| POST | `/api/dexcom/sync` | Sync Dexcom data |

### Surveys & Feedback
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/surveys/daily` | Submit daily survey |
| GET | `/api/surveys/today` | Get today's survey |
| GET | `/api/surveys/history` | Survey history |
| GET | `/api/anomaly-alerts/pending` | Pending ML feedback |
| POST | `/api/correlation/feedback` | Submit correlation feedback |
| GET | `/api/correlation/insights` | Correlation insights |

### Notifications
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/notifications/pending` | Pending notifications |
| GET | `/api/notifications/unread-count` | Unread count |
| GET | `/api/notifications/messages` | All messages |
| POST | `/api/device-tokens` | Register device token |
| POST | `/api/notifications/bug-report` | Submit bug report |
| POST | `/api/notifications/feature-request` | Submit feature request |

### Diagnostics
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/diagnostics/summary` | All diagnostics summary |
| GET | `/api/diagnostics/calcium-score` | Calcium score data |
| GET | `/api/diagnostics/dexa` | DEXA scan data |

### Billing
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/billing/plan` | Current subscription plan |
| GET | `/api/billing/plans` | Available plans |
| GET | `/api/billing/paywall-modals` | Paywall configuration |
| POST | `/api/billing/create-checkout` | Create Stripe checkout |
| POST | `/api/billing/manage` | Customer portal |

---

## Shared UI Components

### Base Components (Shadcn/UI)
**Location**: `client/src/components/ui/`

| Component | File | Usage |
|-----------|------|-------|
| Button | `button.tsx` | Primary interactive element |
| Card | `card.tsx` | Container for content sections |
| Badge | `badge.tsx` | Status indicators, labels |
| Dialog | `dialog.tsx` | Modal dialogs |
| Sheet | `sheet.tsx` | Bottom/side sheets |
| Drawer | `drawer.tsx` | Mobile drawer panels |
| Tabs | `tabs.tsx` | Tab navigation |
| Toast/Toaster | `toast.tsx`, `toaster.tsx` | Notifications |
| Form | `form.tsx` | Form wrapper with validation |
| Input | `input.tsx` | Text input fields |
| Textarea | `textarea.tsx` | Multi-line text input |
| Select | `select.tsx` | Dropdown selection |
| Switch | `switch.tsx` | Toggle switches |
| Checkbox | `checkbox.tsx` | Checkboxes |
| Radio Group | `radio-group.tsx` | Radio buttons |
| Slider | `slider.tsx` | Range sliders |
| Progress | `progress.tsx` | Progress indicators |
| Skeleton | `skeleton.tsx` | Loading states |
| Avatar | `avatar.tsx` | User avatars |
| Accordion | `accordion.tsx` | Collapsible sections |
| Alert | `alert.tsx` | Alert messages |
| Alert Dialog | `alert-dialog.tsx` | Confirmation dialogs |
| Popover | `popover.tsx` | Popover content |
| Tooltip | `tooltip.tsx` | Tooltips |
| Dropdown Menu | `dropdown-menu.tsx` | Dropdown menus |
| Context Menu | `context-menu.tsx` | Right-click menus |
| Command | `command.tsx` | Command palette |
| Calendar | `calendar.tsx` | Date picker |
| Scroll Area | `scroll-area.tsx` | Scrollable containers |
| Separator | `separator.tsx` | Visual dividers |
| Table | `table.tsx` | Data tables |
| Chart | `chart.tsx` | Chart components |
| Sidebar | `sidebar.tsx` | Sidebar navigation |

### Custom Components

| Component | File | Purpose |
|-----------|------|---------|
| FloLogo | `FloLogo.tsx` | Animated brand logo |
| FloBottomNav | `FloBottomNav.tsx` | Bottom navigation bar |
| LockedTile | `LockedTile.tsx` | Premium-locked content placeholder |
| PaywallModal | `PaywallModal.tsx` | Subscription upsell modal |
| WhyButton | `WhyButton.tsx` | "Why" explanation trigger button |
| WhyModal | `WhyModal.tsx` | AI explanation modal |
| DataSourceBadge | `DataSourceBadge.tsx` | HealthKit/Oura/Manual indicator |
| TrendChart | `TrendChart.tsx` | Metric trend visualization |
| InsightCard | `InsightCard.tsx` | Individual insight display |
| ThreePMSurveyModal | `ThreePMSurveyModal.tsx` | 3PM daily check-in survey |
| FeedbackSurveyModal | `FeedbackSurveyModal.tsx` | ML feedback survey |
| UnifiedUploadModal | `UnifiedUploadModal.tsx` | File upload for labs/diagnostics |

---

## Component Patterns

### Tile Pattern
All dashboard tiles follow this structure:
```tsx
interface TileProps {
  isDark: boolean;
  onWhyClick?: () => void;
  data?: TileData; // Some tiles receive props, others fetch internally
}

// States: Loading, Error, Empty, Data
// Styling: backdrop-blur-xl, rounded-3xl, border, p-5
// Dark/Light: Conditional gradient backgrounds
// Test IDs: data-testid="tile-{name}"
```

### Data Fetching Pattern
```tsx
const { data, isLoading, error } = useQuery<DataType>({
  queryKey: ['/api/endpoint'],
  staleTime: 2 * 60 * 1000, // Optional caching
  gcTime: 10 * 60 * 1000,
});
```

### Mutation Pattern
```tsx
const mutation = useMutation({
  mutationFn: async (data) => {
    const response = await apiRequest('POST', '/api/endpoint', data);
    return response.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/related-data'] });
  },
});
```

### Elevation Utilities
CSS utilities for hover/active states:
- `.hover-elevate` - Subtle elevation on hover
- `.active-elevate-2` - More dramatic elevation on press
- `.toggle-elevate` + `.toggle-elevated` - Toggle state styling
- `.no-default-hover-elevate` - Disable default hover behavior

---

## Interaction Guidelines

### Touch Targets
- Minimum: 44pt × 44pt
- Buttons: `h-12` minimum
- Cards: Full-width tap zones

### Animations
- Card expand/collapse: `0.3s ease`
- Transitions: iOS standard slides
- No scroll-triggered animations

### Accessibility
- 4.5:1 contrast minimum
- ARIA labels on icons
- Semantic HTML structure
- Support iOS Dynamic Type

---

*Last updated: December 15, 2025*

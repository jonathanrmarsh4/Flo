# Daily Insights Engine v2.0 - Testing Guide

## System Overview

The Daily Insights Engine v2.0 is now fully integrated into the Flō platform. This guide provides testing steps and verification procedures.

## Architecture Components

### 1. Scheduler (`insightsSchedulerV2.ts`)
- **Status**: ✅ Running
- **Schedule**: Hourly checks at minute 0 (e.g., 01:00, 02:00, 03:00)
- **Trigger Time**: 06:00 local time per user (based on `users.timezone`)
- **Idempotency**: Locked per user per day to prevent duplicate generation

### 2. Orchestrator (`insightsEngineV2.ts`)
- **Function**: `generateDailyInsights(userId: number, targetDate: string)`
- **Data Sources**: 
  - HealthKit samples (90 days)
  - Daily aggregated metrics (90 days)
  - Biomarker measurements + test sessions (all time)
  - Life events (90 days)
- **Analytical Layers**:
  - Layer A: Physiological Pathways (hard-coded science)
  - Layer B: Bayesian Correlations (wired, returns empty until correlation pipeline built)
  - Layer C: Dose-Response & Timing Analysis
  - Layer D: Anomaly Detection & Stale-Lab Early Warning

### 3. Database Schema
```sql
-- Main insights table (actual schema from shared/schema.ts)
CREATE TABLE daily_insights (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_date TEXT NOT NULL, -- YYYY-MM-DD format
  
  -- Content fields
  title TEXT NOT NULL,
  body TEXT NOT NULL, -- Full narrative with magnitude + evidence + context
  action TEXT, -- Recommended action or experiment
  
  -- Scoring and classification
  confidence_score REAL NOT NULL, -- 0.0-1.0
  impact_score REAL NOT NULL, -- 0.0-1.0
  actionability_score REAL NOT NULL, -- 0.0-1.0
  freshness_score REAL NOT NULL, -- 0.0-1.0
  overall_score REAL NOT NULL, -- Rank score (confidence × impact × actionability × freshness)
  
  -- Evidence and sources
  evidence_tier evidence_tier NOT NULL, -- Enum: "1", "2", "3", "4", "5"
  primary_sources TEXT[] NOT NULL, -- Variables involved
  category insight_category NOT NULL, -- Enum: activity_sleep, recovery_hrv, sleep_quality, biomarkers, nutrition, stress, general
  
  -- Layer that generated this insight
  generating_layer TEXT NOT NULL, -- "A_physiological", "B_open_discovery", "C_dose_response", "D_anomaly"
  
  -- Supporting data and user interaction
  details JSONB NOT NULL, -- Extended data including variables, healthDomain, layer info
  is_new BOOLEAN DEFAULT true NOT NULL,
  is_dismissed BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  -- Note: v2.0 allows 0-5 insights per user per day (no UNIQUE constraint)
  -- Index exists on (user_id, generated_date) for efficient queries
);

-- Supporting tables
CREATE TABLE insight_replication_history (...);
CREATE TABLE biomarker_freshness_metadata (...);
```

## API Endpoints

### 1. GET /api/daily-insights
**Purpose**: Fetch today's insights for authenticated user

**Response**:
```json
{
  "success": true,
  "insights": [
    {
      "id": "uuid-string",
      "title": "HRV-Sleep Connection",
      "body": "Your HRV increased 15% when...",
      "action": "Try sleeping 30 minutes earlier for 7 days",
      "confidenceScore": 0.85,
      "impactScore": 0.90,
      "actionabilityScore": 0.88,
      "freshnessScore": 0.95,
      "overallScore": 0.67,
      "evidenceTier": "2",
      "primarySources": ["hrv_rmssd_ms", "sleep_total_minutes"],
      "category": "recovery_hrv",
      "generatingLayer": "A_physiological",
      "details": {
        "variables": ["hrv_rmssd_ms", "sleep_total_minutes"],
        "layer": "A",
        "healthDomain": "recovery"
      },
      "isNew": true,
      "isDismissed": false,
      "createdAt": "2025-11-23T02:00:00.000Z"
    }
  ]
}
```

### 2. POST /api/daily-insights/generate
**Purpose**: Manually trigger insights generation (auth required)

**Request**: `{}`

**Response**:
```json
{
  "success": true,
  "message": "Insights generated successfully",
  "count": 5,
  "insights": [...]
}
```

### 3. POST /api/daily-insights/feedback
**Purpose**: Submit user rating/feedback

**Request**:
```json
{
  "insightId": 1,
  "rating": 5,
  "feedback": "Very helpful!"
}
```

### 4. POST /api/daily-insights/:id/dismiss
**Purpose**: Dismiss an insight

### 5. POST /api/daily-insights/mark-seen
**Purpose**: Mark insights as seen

**Request**:
```json
{
  "insightIds": [1, 2, 3]
}
```

### 6. POST /api/daily-insights/trigger-check (Admin Only)
**Purpose**: Force scheduler check for testing

## Testing Procedures

### Manual Testing Steps

#### 1. Verify Scheduler Initialization
```bash
# Check server logs for:
[InsightsV2Scheduler] Timezone-aware insights scheduler initialized (runs hourly)
```
✅ **Status**: Confirmed in logs

#### 2. Test Manual Generation
```bash
# Via authenticated API call
curl -X POST https://get-flo.com/api/daily-insights/generate \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

**Expected**: 
- Returns 0-5 insights depending on available data
- Day 1: May return 0 (not enough data)
- Day 2+: Should return insights from Layers A/C/D

#### 3. Verify Database Persistence
```sql
-- v2.0 allows 0-5 insights per user per day (no UNIQUE constraint)
SELECT 
  id, user_id, generated_date, title, category, generating_layer, 
  overall_score, evidence_tier, created_at
FROM daily_insights
WHERE user_id = '<USER_ID>'
  AND generated_date = CURRENT_DATE::TEXT
ORDER BY overall_score DESC;
```

#### 4. Test Idempotency
```bash
# Call generate endpoint twice
# Second call should return existing insights from DB (not regenerate)
# Response will have same insights with matching titles/bodies
```

#### 5. Verify Timezone Handling
```sql
-- Check user timezone setting
SELECT id, email, timezone FROM users WHERE id = <USER_ID>;

-- Manually trigger scheduler check
curl -X POST https://get-flo.com/api/daily-insights/trigger-check \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

#### 6. Test Feedback System
```bash
# Submit rating
curl -X POST https://get-flo.com/api/daily-insights/feedback \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"insightId": 1, "rating": 5, "feedback": "Great insight!"}'
```

## Known Limitations (MVP)

### Layer B (Bayesian Correlations)
- **Status**: Wired but returns empty results
- **Reason**: Requires correlation computation infrastructure
- **Impact**: MVP relies on Layers A, C, D for insights
- **Future**: Phase 2 will implement full correlation engine

### Data Requirements
- **Minimum**: 2 days of HealthKit data OR biomarker data
- **Optimal**: 14+ days for robust pattern detection
- **Layer D**: Requires biomarker + HealthKit data for early warning

## Troubleshooting

### No insights generated
1. Check data availability: User needs HealthKit samples OR biomarker data
2. Verify scheduler is running: Look for [InsightsV2Scheduler] in logs
3. Check for errors in persistence: Separate try-catch blocks log errors independently

### Duplicate insights
- Verify idempotency lock is working (daily_insights UNIQUE constraint)
- Check scheduler isn't running multiple times

### Wrong timezone
- Verify user.timezone is set correctly
- Check scheduler converts to UTC properly

## Success Criteria

✅ Scheduler initializes on server startup  
✅ Manual generation endpoint works  
✅ Database persistence with idempotency  
✅ Timezone-aware 6am local scheduling  
✅ Error isolation per user (one failure doesn't block others)  
✅ Feedback system functional  
⏳ Automatic nightly generation (requires waiting until 06:00 local time)

## Next Steps

1. Monitor first automatic run at 06:00 local time
2. Verify insights appear in frontend UI
3. Collect user feedback on insight quality
4. Phase 2: Implement Layer B correlation computation

# Code Sweep Report - Unused & Broken Code Analysis

**Date:** 2025-01-27  
**Status:** Complete Analysis

## 🔴 Critical Issues (Must Fix)

### 1. Broken File with Syntax Error
**File:** `client/src/hooks/useHealthKitAutoSync.ts.broken`
**Issue:** Uses undeclared variable `lastActiveTime` (referenced on lines 261, 266, 275)
**Impact:** File cannot be compiled/used
**Recommendation:** 
- **DELETE** this file immediately - there's already a working version at `client/src/hooks/useHealthKitAutoSync.ts`
- The `.broken` extension indicates this was intentionally disabled, but it's clutter

```typescript
// Line 261, 266, 275 - lastActiveTime.current is used but never declared
lastActiveTime.current = Date.now(); // ❌ ReferenceError
```

### 2. Deprecated Module Still in Active Use
**File:** `client/src/lib/stripe-native.ts`
**Issue:** File is marked as `@deprecated` but still imported and used in `App.tsx`
**Current Usage:**
- `client/src/App.tsx:15` - imports `initializeStripeNative`
- `client/src/App.tsx:202` - calls `initializeStripeNative()`

**Recommendation:**
- Remove the import and call from `App.tsx` since:
  - It's deprecated for iOS subscriptions
  - StoreKit is the replacement
  - Comment says it's "kept for potential web Stripe payments" but it's being initialized on native platforms
- **Option 1:** Delete the file if web Stripe payments aren't needed
- **Option 2:** Keep file but remove native platform initialization (only use for web if needed)

## ⚠️ Unused Code (Cleanup Recommended)

### 3. Unused Exported Function
**File:** `server/services/lifeEventParser.ts`
**Function:** `formatAcknowledgment()` (lines 431-436)
**Issue:** Function is exported but never imported or called anywhere
**Recommendation:** 
- Remove the function if not needed, OR
- If kept for future use, document why it's not currently used

### 4. Disabled Function Still Referenced
**File:** `client/src/lib/flomentumNotifications.ts`
**Function:** `scheduleThreePMSurvey()` (lines 367-373)
**Issue:** Function is disabled (just returns early) but still called from `initializeFlomentumNotifications()` (line 434)
**Current Behavior:** Function logs a message and returns immediately
**Recommendation:**
- Remove the call from `initializeFlomentumNotifications()` since it does nothing
- Keep function if you want to re-enable it later, OR
- Delete entirely if server-side APNs is permanent solution

## 🧹 Temporary/Debug Files (Consider Removing)

### 5. Root-Level Debug Scripts
These appear to be temporary debugging scripts with hardcoded user IDs:

- `check_clickhouse.ts` - Debug script for ClickHouse data
- `check_weight_flow.ts` - Debug script for weight data flow
- `check_drivers.ts` - Debug script for forecast drivers
- `check-data-range.ts` - Debug script for data ranges
- `test-correlation-engine.ts` - Test script for correlation engine

**Recommendation:**
- Move to `scripts/debug/` or `scripts/temp/` directory if they're still useful
- Delete if no longer needed for debugging
- These shouldn't be in the root directory

### 6. One-Time Migration Scripts
**Location:** `scripts/` directory
**Files:** Various SQL fix scripts that appear to be one-time migrations:
- `fix-supabase-schema.sql`
- `fix-supabase-schema-complete.sql`
- `fix-source-id-nullable.sql`
- `fix-supabase-column-names.sql`
- `create-supabase-match-function.sql`
- `create-supabase-match-function-fixed.sql`
- `setup-user-insights-embeddings.sql`

**Recommendation:**
- Move to `scripts/migrations/` or `scripts/legacy/` directory
- Document which ones have been applied
- Consider archiving or removing applied migrations

## 📝 Code Quality Improvements

### 7. Unused Import in AssessmentDetail.tsx
**File:** `client/src/pages/AssessmentDetail.tsx:1`
**Imports:** `Component`, `ErrorInfo`, `ReactNode` from React
**Status:** ✅ **Actually Used** - These are used in the `CheckInErrorBoundary` class (lines 42-90)
**Action:** No changes needed

### 8. Empty Function Body
**File:** `server/services/lifeEventParser.ts:431-436`
**Function:** `formatAcknowledgment()` has minimal implementation (just returns the acknowledgment)
**Recommendation:** If this is intentionally minimal, add a comment explaining why. Otherwise, implement or remove.

### 9. Deprecated Code Comments
Several files have extensive comments about removed/disabled features:
- `server/services/insightsEngineV2.ts` - Comments about removed Layers A, B, C
- `server/routes/admin.ts` - Comments about removed shadow math comparison endpoints
- `server/services/clickhouseBaselineEngine.ts` - Comments about removed systems

**Recommendation:** 
- Keep for historical context OR
- Create a `CHANGELOG.md` and remove verbose comments after documenting in changelog

## 🔍 Files to Review Manually

### 10. Potentially Unused Scripts
These scripts in `scripts/` directory may be one-time use:
- `add-common-synonyms.ts`
- `add-formatting-synonyms.ts`
- `add-growth-hormone.ts`
- `add-missing-biomarkers.ts`
- `migrate-biomarker-units.ts`
- `remove-duplicate-biomarkers.ts`
- `seed-biomarkers.ts`

**Recommendation:** Review if these are:
- Still needed for maintenance
- One-time migrations that can be archived
- Should be part of a seed/migration system

### 11. JSON Data Files
- `scripts/healthkit_baselines.json`
- `scripts/nhanes_biomarker_baselines.json`
- `scripts/synthetic_healthkit_data.json`

**Recommendation:** Document purpose and whether these are:
- Reference data (keep in repo)
- Test data (move to tests/)
- Generated files (add to .gitignore if generated)

## ✅ Summary & Action Items

### Immediate Actions (High Priority) - ✅ COMPLETED
1. ✅ **DELETED** `client/src/hooks/useHealthKitAutoSync.ts.broken`
2. ✅ **REMOVED** deprecated `initializeStripeNative()` call from `App.tsx`
3. ✅ **MOVED** root-level debug scripts to `scripts/debug/` directory

### Recommended Cleanup (Medium Priority) - ✅ COMPLETED
4. ✅ **DOCUMENTED** `formatAcknowledgment()` - added @deprecated comment explaining it's unused but kept for future use
5. ✅ **REMOVED** call to disabled `scheduleThreePMSurvey()` and added explanatory comment
6. ✅ **ORGANIZED** scripts directory - created `scripts/debug/` and `scripts/migrations/` with README files

### Future Improvements (Low Priority) - ✅ COMPLETED
7. ✅ **DOCUMENTED** purpose of JSON data files in `scripts/DATA_FILES.md`
8. ⏳ **CREATE** CHANGELOG for major refactorings mentioned in comments (optional - low priority)
9. ✅ **ORGANIZED** SQL migration scripts into `scripts/migrations/` directory structure

## 📊 Statistics

- **Broken Files:** 1
- **Deprecated but Active:** 1
- **Unused Exports:** 1
- **Debug Scripts in Root:** 5
- **One-Time Migration Scripts:** ~7
- **Linter Errors:** 0 ✅

## Notes

- Overall code quality is good - no TypeScript compilation errors
- Most issues are organizational rather than functional
- The codebase shows signs of active development with temporary debug files
- Consider setting up a `.scripts/` or `scripts/temp/` directory for temporary files


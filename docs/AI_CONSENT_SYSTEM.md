# Flō AI Consent System - Apple App Store Compliance

## Overview

This document describes the AI consent system implemented to comply with Apple App Store requirements for sharing health data with third-party AI services. The system ensures users explicitly consent before their health data is processed by external AI providers.

## Third-Party AI Providers

Flō uses the following AI services:

| Provider | Purpose | Data Shared |
|----------|---------|-------------|
| **Google AI (Gemini)** | Insight generation, pattern analysis, Flō Oracle chat, voice assistant, morning briefings | Anonymized health metrics, biomarkers, sleep/activity patterns |
| **OpenAI (GPT-4o)** | Lab report analysis, blood work extraction | Lab PDF text (no PII) |

## Privacy Architecture

### Data Anonymization
- Health data is stored in Supabase linked via pseudonymous `health_id`
- User identity data (name, email) stored separately in Neon database
- AI prompts receive health metrics but **no email or user ID**
- First name is included for personalized greetings (disclosed in consent)

### Separation of Concerns
```
┌─────────────────┐     ┌─────────────────┐
│   Neon (Identity)│     │ Supabase (Health)│
│                 │     │                 │
│ - User ID       │     │ - health_id     │
│ - Email         │◄────┤ - Biomarkers    │
│ - Name          │     │ - HealthKit     │
│ - Consent       │     │ - Sleep/Activity│
└─────────────────┘     └─────────────────┘
         │                       │
         └───────┬───────────────┘
                 │
                 ▼ (health_id link only)
         ┌───────────────┐
         │   AI Services │
         │ (Anonymized)  │
         └───────────────┘
```

## User Consent Flow

### 1. Onboarding (New Users)
```
Welcome → Notifications → Location → Profile → Bloodwork → 
Optional → Integrations → Security → AI Consent → Complete
```

The AI Consent screen appears **after security setup** and **before dashboard access**.

### 2. AIConsentScreen Component
**Location:** `client/src/components/onboarding/AIConsentScreen.tsx`

Features:
- Benefits-first messaging explaining personalized insights
- Clear list of AI vendors with purposes
- Privacy assurances:
  - "Your data is anonymized before sharing"
  - "Health data stored separately from your identity"
  - "You can disable at any time in Settings"
- Two paths:
  - **Enable AI Features** - Grants consent, proceeds to dashboard
  - **Continue Without AI** - Skips consent, AI features disabled

### 3. Settings Toggle (Existing Users)
**Location:** `client/src/components/ProfileScreen.tsx` → Data & Privacy section

Users can revoke or grant consent at any time via the "AI Features" toggle.

## Backend Implementation

### Database Schema
```sql
-- In users table (Neon)
aiConsentGranted: boolean     -- Has user consented?
aiConsentDate: timestamp      -- When did they consent?
aiConsentVersion: varchar     -- Which policy version (e.g., "1.0")
```

### API Endpoints
```
GET  /api/user/ai-consent
  Response: { consented, consentDate, consentVersion, currentVersion, needsReconsent }

POST /api/user/ai-consent
  Body: { consented: boolean, version: string }
  Response: { success: true, consented }
```

### Consent Gate Middleware
**Location:** `server/middleware/planEnforcement.ts`

The `requireAIConsent` middleware gates all AI endpoints:

```typescript
export async function requireAIConsent(req, res, next) {
  // Check if user has granted AI consent
  const user = await storage.getUser(userId);
  if (!user?.aiConsentGranted) {
    return res.status(403).json({
      error: 'AI_CONSENT_REQUIRED',
      message: 'Enable AI Features in Settings to use this feature'
    });
  }
  next();
}
```

### Protected Endpoints
All these routes require AI consent:

| Endpoint | Feature |
|----------|---------|
| `/api/oracle/chat` | Flō Oracle chat |
| `/api/oracle/voice-relay` | Voice streaming |
| `/api/oracle/voice-greeting` | Voice greetings |
| `/api/oracle/stream` | Live streaming |
| `/api/insights/daily` | Daily insights |
| `/api/generate-insights` | Insight generation |
| `/api/briefing/generate` | Morning briefings |
| `/api/insights/why/:id` | Why explanations |

## Version Tracking & Re-consent

### How It Works
1. `CURRENT_AI_CONSENT_VERSION` is defined in `server/routes.ts`
2. When user consents, their version is stored in the database
3. GET `/api/user/ai-consent` compares stored vs current version
4. If versions differ, `needsReconsent: true` is returned
5. Client can prompt user to review updated policy

### Triggering Re-consent
When AI vendors or data usage changes:

1. Increment `CURRENT_AI_CONSENT_VERSION` in `server/routes.ts`:
   ```typescript
   const CURRENT_AI_CONSENT_VERSION = '1.1'; // Was '1.0'
   ```

2. Update AIConsentScreen to reflect changes

3. Users with older consent version will see `needsReconsent: true`

4. App can redirect them to consent screen or show modal

## UI Attribution

### WhyModal
**Location:** `client/src/components/WhyModal.tsx`

Footer shows: "Powered by Google AI"

### VoiceChatScreen
**Location:** `client/src/components/VoiceChatScreen.tsx`

Footer shows: "Powered by Google AI"

## Privacy Policy Updates

**Location:** `client/src/components/PrivacyPolicyScreen.tsx`

Section 4.2 "To Power AI-Driven Features" now includes:

1. **Third-Party AI Providers** - Lists vendors with purposes
2. **Data Anonymization** - Explains PII removal process
3. **Your Consent Controls** - Explains Settings toggle

## Testing Checklist

### New User Flow
- [ ] Create new account
- [ ] Complete onboarding until AI Consent screen
- [ ] Verify vendors and privacy info displayed
- [ ] Test "Enable AI Features" path → consent saved
- [ ] Test "Continue Without AI" path → consent not saved
- [ ] Verify AI features work/blocked based on consent

### Existing User Toggle
- [ ] Go to Settings → Data & Privacy
- [ ] Toggle AI Features off
- [ ] Verify AI endpoints return 403
- [ ] Toggle AI Features on
- [ ] Verify AI endpoints work

### Re-consent Flow
- [ ] Set user's `aiConsentVersion` to old value (e.g., "0.9")
- [ ] Increment `CURRENT_AI_CONSENT_VERSION` to "1.1"
- [ ] Call GET `/api/user/ai-consent`
- [ ] Verify `needsReconsent: true` returned

## Compliance Notes

### Apple App Store Requirements
- ✅ Explicit consent before sharing health data with third parties
- ✅ Clear disclosure of which AI services receive data
- ✅ Explanation of what data is shared and why
- ✅ Easy opt-out mechanism in Settings
- ✅ Privacy Policy documentation

### GDPR/Privacy Considerations
- ✅ Lawful basis: User consent (not legitimate interest)
- ✅ Data minimization: Only health metrics shared, no PII
- ✅ Right to withdraw: Settings toggle
- ✅ Transparent processing: Privacy Policy section 4.2

## File Reference

| File | Purpose |
|------|---------|
| `client/src/components/onboarding/AIConsentScreen.tsx` | Onboarding consent UI |
| `client/src/components/onboarding/SetupSteps.tsx` | Onboarding flow orchestration |
| `server/middleware/planEnforcement.ts` | `requireAIConsent` middleware |
| `server/routes.ts` | API endpoints, version constant |
| `shared/schema.ts` | Database schema (users table) |
| `client/src/components/ProfileScreen.tsx` | Settings privacy toggle |
| `client/src/components/WhyModal.tsx` | AI attribution footer |
| `client/src/components/VoiceChatScreen.tsx` | AI attribution footer |
| `client/src/components/PrivacyPolicyScreen.tsx` | Privacy Policy section 4.2 |

## Maintenance

### Adding New AI Vendor
1. Update AIConsentScreen to list new vendor
2. Update Privacy Policy section 4.2
3. Bump `CURRENT_AI_CONSENT_VERSION` to trigger re-consent
4. Update this document

### Changing Data Shared
1. Review if change requires re-consent
2. If yes, bump version and update consent screen
3. Update Privacy Policy
4. Update this document

# Flō Onboarding System

## Overview

The onboarding system is a two-phase guided experience for new users that introduces app features and collects essential setup information.

## Architecture

### Components

```
client/src/components/
├── OnboardingScreen.tsx          # Main container component
└── onboarding/
    ├── FeatureShowcase.tsx       # Phase 1: Feature carousel
    └── SetupSteps.tsx            # Phase 2: Setup wizard
```

### Flow

1. **Feature Showcase (Phase 1)** - 4-screen carousel introducing key features
2. **Setup Steps (Phase 2)** - 4-step guided setup wizard

## Feature Showcase

### Screens

| Screen | Icon | Gradient | Description |
|--------|------|----------|-------------|
| Welcome | Droplet | cyan→blue→purple | Introduction to Flō |
| Biomarkers | Activity | teal→emerald→green | Blood marker tracking |
| AI Oracle | Sparkles | purple→pink→rose | AI-powered insights |
| Action Plan | Target | orange→amber→yellow | Goal tracking |

### Interactions
- Swipe/click navigation between screens
- Progress dots with clickable navigation
- "Skip" button available during showcase only
- "Next" / "Let's Get Started" button

## Setup Steps

### Steps

| Step | Icon | Gradient | Required | Description |
|------|------|----------|----------|-------------|
| Notifications | Bell | blue→cyan | Yes* | Enable notifications + HealthKit |
| Profile | User | teal→emerald | Yes | Name, birth year, biological sex |
| Blood Work | Upload | purple→pink | Yes | Upload blood test PDF |
| Optional Scans | Bone | orange→amber | No | CAC + DEXA scans |

*At least one of Notifications or HealthKit must be enabled

### Validation
- Continue button disabled until step requirements met
- Progress bar shows completion status
- Skip option available only on Optional Scans step

## Integration

### App.tsx

The onboarding is integrated in the main Router component:

```typescript
const ONBOARDING_COMPLETED_KEY = 'flo_onboarding_completed';

// Check if user needs onboarding
useEffect(() => {
  if (isAuthenticated && user?.id) {
    const onboardingKey = `${ONBOARDING_COMPLETED_KEY}_${user.id}`;
    const completed = localStorage.getItem(onboardingKey);
    if (!completed) {
      setShowOnboarding(true);
    }
  }
}, [isAuthenticated, user?.id]);
```

### Persistence

Onboarding completion is stored per-user in localStorage:
- Key format: `flo_onboarding_completed_{userId}`
- Values: `'true'` (completed) or `'skipped'` (skipped)

## Styling

### Theme Support
- `isDark` prop passed to all components
- Glassmorphic design with backdrop blur
- Gradient buttons and icons per step

### Animations
```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes floatPulse {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-10px) scale(1.05); }
}
```

## Testing

To test onboarding:
1. Clear localStorage for the user: `localStorage.removeItem('flo_onboarding_completed_{userId}')`
2. Refresh the app
3. Onboarding should appear

## Future Enhancements

- [ ] Connect notifications toggle to actual iOS notification permission request
- [ ] Connect HealthKit toggle to actual HealthKit authorization
- [ ] Implement actual file upload in Blood Work step
- [ ] Save profile data to user record
- [ ] Optional: Add onboarding reset in Profile settings

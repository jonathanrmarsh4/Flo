# Design Guidelines: Blood Work Tracker MVP

## Design Approach
**Selected System**: Apple Human Interface Guidelines (HIG)
- **Rationale**: Mobile-first iOS app requiring trust, clarity, and clean data presentation. Healthcare applications benefit from Apple's content-focused, minimalist approach that emphasizes legibility and hierarchy.

## Core Design Principles
1. **Trust Through Clarity**: Medical data demands precision - clear typography, generous spacing, and unambiguous UI elements
2. **Data-First Layout**: Blood work metrics and AI insights take visual priority
3. **Progressive Disclosure**: Complex health information revealed progressively to avoid overwhelming users
4. **Touch-Optimized**: Minimum 44pt touch targets, generous padding for mobile interactions

## Typography System
- **Primary Font**: SF Pro Display (iOS system font)
- **Hierarchy**:
  - Large Titles: 34pt, bold (screen headers)
  - Title 1: 28pt, regular (section headers, biological age display)
  - Title 2: 22pt, semibold (metric labels, card headers)
  - Body: 17pt, regular (primary content, insights)
  - Callout: 16pt, regular (secondary information)
  - Caption: 12pt, regular (timestamps, metadata)

## Layout System
**Spacing Primitives**: Use Tailwind units of **4, 6, 8, 12** (e.g., p-4, py-8, gap-6, mb-12)
- **Screen Padding**: px-4 (16px) for mobile consistency
- **Card Spacing**: p-6 internal padding, mb-4 between cards
- **Section Gaps**: space-y-8 for vertical rhythm
- **Component Spacing**: gap-4 for grouped elements

**Container Strategy**:
- Full-width cards with subtle borders/shadows
- max-w-md for centered content containers
- List items: full-width with internal padding

## Component Library

### Navigation
- **Bottom Tab Bar** (iOS standard):
  - Home (dashboard), Upload, History, Profile
  - Fixed position, subtle top border
  - Icons + labels, 50pt height minimum
  
### Data Display Components

**Biological Age Card** (Hero Component):
- Large prominent display (biological age as headline)
- Comparison to chronological age
- Brief insight summary
- py-8 padding, centered content
- Elevated visual treatment (subtle shadow)

**Blood Work Metrics Grid**:
- 2-column grid on mobile (grid-cols-2)
- Each metric card: metric name, value, unit, trend indicator
- p-4 per card, gap-3 between cards
- Visual indicators for out-of-range values

**AI Insights Panel**:
- Full-width cards
- Icon + heading + body text structure
- space-y-3 for readability
- Collapsible sections for detailed recommendations

**Timeline/History View**:
- Vertical timeline with date markers
- Compact card design per upload
- Date prominently displayed
- Tap to expand for full details

### Forms & Inputs

**File Upload Component**:
- Large touch target (min-h-48)
- Drag-and-drop area with clear call-to-action
- File type indicators (PDF/Image icons)
- Upload progress indicator
- p-8 padding for comfortable touch zone

**Form Fields** (if needed for profile):
- Full-width inputs
- Labels above fields
- h-12 minimum height
- Clear focus states
- Helper text below (text-sm)

### Interactive Elements

**Buttons**:
- Primary: Full-width or auto-width, h-12, rounded-lg, font-semibold
- Secondary: Outlined style, same dimensions
- Text buttons: No background, underline on press
- Minimum spacing between stacked buttons: gap-3

**Cards**:
- rounded-xl (12px border radius)
- Subtle shadows for elevation
- p-6 internal padding
- mb-4 between cards
- Full-width on mobile

### Data Visualization
- **Trend Charts**: Line charts showing metric progression over time
- **Range Indicators**: Visual bars showing optimal/suboptimal ranges
- Clean axis labels, minimal gridlines
- Touch-friendly data point interaction

## Screen Layouts

### Dashboard (Home)
1. Biological Age Card (hero)
2. Latest AI Insights (3-4 key recommendations)
3. Recent Metrics Overview (6-8 key values)
4. Quick Upload CTA

### Upload Screen
1. Large upload zone (centered, primary action)
2. Recent uploads list below
3. Clear file type support indicators
4. Processing status during AI analysis

### History/Timeline
1. Date-grouped entries (most recent first)
2. Compact card per upload
3. Expandable details
4. Compare functionality (optional)

### Results Detail
1. Upload date/metadata
2. Biological age display
3. Full metrics table/grid
4. Complete AI analysis
5. Downloadable report option

## Images
**Hero Section**: Not applicable - data dashboard prioritized over imagery
**Icons**: Use SF Symbols (iOS system icons) for:
- Navigation tabs (house, arrow.up.doc, clock, person)
- Metric categories (heart, drop, flame for different test types)
- Status indicators (checkmark, exclamation)

**Illustrations**: Optional AI-themed illustration on upload screen empty state

## Accessibility
- Maintain 4.5:1 contrast minimum for all text
- Interactive elements 44pt minimum
- Clear focus indicators
- Semantic HTML structure
- ARIA labels for icons
- Support iOS Dynamic Type (scalable text)

## Animation Guidelines
**Minimal, purposeful animations only**:
- Card expand/collapse: 0.3s ease
- Upload progress: Smooth loading states
- Screen transitions: iOS standard slide animations
- NO scroll-triggered animations
- NO decorative motion

## Mobile-First Constraints
- Single-column layouts (grid-cols-1 base, max grid-cols-2)
- Thumb-zone optimization (key actions within bottom 2/3 of screen)
- Scrollable content with sticky headers where needed
- Safe area insets respected for iOS notch

This design creates a trustworthy, data-focused health tracking experience optimized for mobile iOS deployment.
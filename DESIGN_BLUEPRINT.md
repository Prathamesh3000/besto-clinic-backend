# BestoClinic Design Blueprint

> The definitive reference for the complete UI redesign across website and mobile app.
> Every design decision in this document is derived from the BestoClinic brand identity
> (logo colors: Blue `#2E5FA2` + Green `#4CA626`) and best practices observed in
> SimplePractice, Cliniko, Pabau, CareStack, and NexHealth.

---

## 1. Brand Foundation

### 1.1 Logo DNA

The BestoClinic logo contains three core elements:
- **Blue medical cross** (`#2E5FA2`) — trust, professionalism, healthcare
- **Green capsule overlay** (`#4CA626`) — vitality, growth, wellness
- **White checkmark swoosh** — verified quality, positive outcomes

These two colors are non-negotiable anchors. Every surface, component, and interaction
in the platform must feel like it belongs to this logo.

### 1.2 Design Philosophy

```
PRINCIPLE 1 — "Clinical, not sterile"
  Healthcare platforms default to cold blues and grays.
  BestoClinic uses warmth (green accents, off-white surfaces) to feel approachable
  without sacrificing medical credibility.

PRINCIPLE 2 — "Breathing room over density"
  Cliniko's #1 strength is negative space. Every section, card, and row
  gets generous padding. Cramped UI = cheap UI.

PRINCIPLE 3 — "One action per moment"
  SimplePractice's success comes from clear visual hierarchy.
  Every screen has ONE primary action. Everything else is secondary or tertiary.

PRINCIPLE 4 — "Consistent depth"
  Shadows, borders, and elevation follow a strict system.
  No ad-hoc box-shadows. No inconsistent border-radius.

PRINCIPLE 5 — "Motion with purpose"
  Animations exist to communicate state change, not to impress.
  Spring physics (fast settle, slight overshoot) for interactions.
  Fade-up for content loading. No decorative motion.
```

---

## 2. Color System

### 2.1 Brand Colors (From Logo)

```
BESTO BLUE
  #2E5FA2  — The anchor. Used for primary actions, key UI elements, trust signals.

BESTO GREEN
  #4CA626  — The differentiator. Used for success states, health indicators, CTAs where
              energy/action is needed.
```

### 2.2 Primary Scale (Blue) — Derived from `#2E5FA2`

The primary scale is a cool blue that conveys trust and professionalism.
Used for: buttons, links, active states, focus rings, primary navigation indicators.

```
primary-50:   #EEF4FB   — Subtle tinted backgrounds (selected rows, active tab bg)
primary-100:  #D5E3F5   — Light wash (hover backgrounds, info banners)
primary-200:  #ABC7EB   — Borders on focused/active inputs
primary-300:  #7FA8DF   — Placeholder accents, progress bar tracks
primary-400:  #5488D0   — Secondary icon tints, link hover
primary-500:  #2E6AB8   — Standard links, icon default
primary-600:  #2E5FA2   — THE brand blue. Primary buttons, active nav items
primary-700:  #264D84   — Pressed/hover state for primary buttons
primary-800:  #1F3D68   — Dark button variant, sidebar active on dark surfaces
primary-900:  #1A3155   — Very dark — headings on light backgrounds when blue is needed
primary-950:  #0F1D33   — Near-black blue — use sparingly for ultra-dark contexts
```

### 2.3 Secondary Scale (Green) — Derived from `#4CA626`

The secondary/accent scale is a vibrant green for energy and health.
Used for: success states, health metrics, positive actions, accent highlights,
secondary CTAs, badges, progress indicators.

```
secondary-50:   #F2FAF0   — Success banner backgrounds, positive row tint
secondary-100:  #E0F4DB   — Light success wash
secondary-200:  #C1E8B7   — Success borders
secondary-300:  #94D680   — Progress bar fills, positive chart segments
secondary-400:  #6BC44E   — Active health indicators
secondary-500:  #4CA626   — THE brand green. Success badges, health scores
secondary-600:  #3D8A1F   — Pressed green buttons, dark success text
secondary-700:  #316E19   — Dark green for text-on-light backgrounds
secondary-800:  #285814   — Very dark green
secondary-900:  #204810   — Heading accents
secondary-950:  #112808   — Near-black green
```

### 2.4 Neutral Scale — "Slate Blue"

Not pure gray. Tinted very slightly toward blue (matching the primary) so neutrals
feel cohesive with the brand rather than disconnected. Inspired by Cliniko's purple-gray
text approach.

```
neutral-50:   #F8FAFB   — Page background (replaces cream-50)
neutral-100:  #F1F4F6   — Section backgrounds, input backgrounds
neutral-200:  #E4E8EC   — Subtle borders, dividers, disabled backgrounds
neutral-300:  #CED4DA   — Card borders, input borders
neutral-400:  #A8B2BD   — Placeholder text, disabled icons
neutral-500:  #7C8A97   — Tertiary text, muted labels
neutral-600:  #556170   — Secondary text, descriptions
neutral-700:  #3D4A57   — Body text (primary readable)
neutral-800:  #27333F   — Headings, strong labels
neutral-900:  #151E27   — Display headings, high-emphasis text
neutral-950:  #0B1015   — Near-black for maximum contrast
```

### 2.5 Semantic Colors

```
SUCCESS
  light:  #F2FAF0    bg for banners/toasts
  main:   #22C55E    icons, badges, indicators
  dark:   #15803D    text on light backgrounds

WARNING
  light:  #FFFBEB
  main:   #F59E0B
  dark:   #B45309

ERROR
  light:  #FEF2F2
  main:   #EF4444
  dark:   #B91C1C

INFO
  light:  #EEF4FB    (uses primary-50)
  main:   #2E5FA2    (uses primary-600)
  dark:   #264D84    (uses primary-700)
```

### 2.6 Surface & Elevation Colors

```
surface-base:      #FFFFFF     — Cards, panels, modals
surface-raised:    #FFFFFF     — Elevated cards (differentiated by shadow, not color)
surface-overlay:   #FFFFFF     — Dropdowns, popovers, tooltips
surface-page:      #F8FAFB     — Page/screen background (neutral-50)
surface-sunken:    #F1F4F6     — Inset areas, code blocks, table headers (neutral-100)
surface-sidebar:   #FFFFFF     — Sidebar background (clean white, content differentiates)
```

### 2.7 Color Usage Rules

```
DO:
  - Use primary-600 (#2E5FA2) for the single most important action on any screen
  - Use secondary-500 (#4CA626) for success/health/positive states
  - Use neutral-700 (#3D4A57) for body text — NOT pure black
  - Use neutral-50 (#F8FAFB) for page backgrounds — NOT pure white
  - Use primary-50 (#EEF4FB) for selected/active row highlights
  - Use white (#FFFFFF) for card/surface backgrounds

DON'T:
  - Never use primary-600 and secondary-500 side by side as equal-weight CTAs
  - Never use pure black (#000000) for text anywhere
  - Never use pure white (#FFFFFF) as a page background (only for surfaces/cards)
  - Never combine more than 2 semantic colors in one component
  - Never use opacity < 0.6 for interactive text (accessibility)
```

---

## 3. Typography

### 3.1 Font Stack

```
DISPLAY / HEADINGS:
  "Plus Jakarta Sans", system-ui, -apple-system, sans-serif
  Weights: 600 (SemiBold), 700 (Bold), 800 (ExtraBold)
  Purpose: Page titles, card headings, section headers, stat values

BODY / UI:
  "Inter", system-ui, -apple-system, sans-serif
  Weights: 400 (Regular), 500 (Medium), 600 (SemiBold)
  Purpose: Body text, labels, buttons, inputs, navigation items

MONOSPACE (data/codes):
  "JetBrains Mono", "Fira Code", monospace
  Weight: 400, 500
  Purpose: Patient IDs, timestamps, codes, table numbers
```

### 3.2 Type Scale — Web

| Token          | Size   | Line Height | Weight           | Font     | Usage                          |
|----------------|--------|-------------|------------------|----------|--------------------------------|
| `display-xl`   | 48px   | 56px        | 800 (ExtraBold)  | Jakarta  | Landing page hero              |
| `display-lg`   | 36px   | 44px        | 700 (Bold)       | Jakarta  | Page titles                    |
| `display-md`   | 30px   | 38px        | 700 (Bold)       | Jakarta  | Section headings               |
| `heading-lg`   | 24px   | 32px        | 600 (SemiBold)   | Jakarta  | Card titles, modal titles      |
| `heading-md`   | 20px   | 28px        | 600 (SemiBold)   | Jakarta  | Subsection titles              |
| `heading-sm`   | 16px   | 24px        | 600 (SemiBold)   | Jakarta  | Small card titles, table heads |
| `body-lg`      | 16px   | 26px        | 400 (Regular)    | Inter    | Comfortable reading body text  |
| `body-md`      | 14px   | 22px        | 400 (Regular)    | Inter    | Default body / descriptions    |
| `body-sm`      | 13px   | 20px        | 400 (Regular)    | Inter    | Compact body (tables, lists)   |
| `label-lg`     | 14px   | 20px        | 500 (Medium)     | Inter    | Form labels, nav items         |
| `label-md`     | 13px   | 18px        | 500 (Medium)     | Inter    | Chip labels, secondary nav     |
| `label-sm`     | 11px   | 16px        | 500 (Medium)     | Inter    | Overline labels, section tags  |
| `button-lg`    | 15px   | 20px        | 600 (SemiBold)   | Inter    | Large buttons                  |
| `button-md`    | 14px   | 20px        | 600 (SemiBold)   | Inter    | Default buttons                |
| `button-sm`    | 13px   | 18px        | 500 (Medium)     | Inter    | Small buttons, links           |
| `caption`      | 12px   | 16px        | 400 (Regular)    | Inter    | Timestamps, help text          |
| `overline`     | 11px   | 16px        | 600 (SemiBold)   | Inter    | Section labels (uppercase)     |
| `stat-value`   | 28px   | 34px        | 700 (Bold)       | Jakarta  | Dashboard metric numbers       |
| `stat-label`   | 12px   | 16px        | 500 (Medium)     | Inter    | Below stat numbers             |

### 3.3 Type Scale — Mobile (React Native)

| Token          | Size   | Line Height | Weight     | Letter Spacing |
|----------------|--------|-------------|------------|----------------|
| `h1`           | 28px   | 34px        | Bold       | -0.5           |
| `h2`           | 22px   | 28px        | SemiBold   | -0.3           |
| `h3`           | 18px   | 24px        | SemiBold   | -0.2           |
| `h4`           | 16px   | 22px        | Medium     | 0              |
| `bodyLarge`    | 16px   | 24px        | Regular    | 0              |
| `body`         | 14px   | 20px        | Regular    | 0              |
| `bodySmall`    | 12px   | 16px        | Regular    | 0              |
| `label`        | 14px   | 20px        | Medium     | 0              |
| `labelSmall`   | 12px   | 16px        | Medium     | 0.2            |
| `button`       | 15px   | 20px        | SemiBold   | 0.1            |
| `buttonSmall`  | 13px   | 18px        | Medium     | 0              |
| `caption`      | 11px   | 14px        | Regular    | 0.3            |

### 3.4 Typography Rules

```
1. HEADING COLOR:   neutral-900 (#151E27)
2. BODY COLOR:      neutral-700 (#3D4A57) — NOT neutral-900, NOT black
3. SECONDARY TEXT:  neutral-600 (#556170)
4. TERTIARY TEXT:   neutral-500 (#7C8A97)
5. DISABLED TEXT:   neutral-400 (#A8B2BD)
6. LINK COLOR:      primary-600 (#2E5FA2), hover: primary-700
7. STAT VALUES:     Display font (Jakarta), neutral-900
8. SECTION LABELS:  label-sm, uppercase, letter-spacing 0.05em, neutral-500
9. Never go below 11px on web or mobile (accessibility minimum)
10. Maximum line length for body text: 65-75 characters
```

---

## 4. Spacing System

### 4.1 Base Unit

Base = **4px**. Every spacing value is a multiple of 4.

### 4.2 Scale

| Token    | Value | Usage                                             |
|----------|-------|---------------------------------------------------|
| `0`      | 0px   | No space                                          |
| `0.5`    | 2px   | Hairline gaps (icon-to-text tight)                |
| `1`      | 4px   | Minimal gap (badge padding, compact lists)        |
| `1.5`    | 6px   | Compact vertical (between related tiny items)     |
| `2`      | 8px   | Default small gap (icon-label, between chips)     |
| `3`      | 12px  | Card internal padding (tight), list item gaps     |
| `4`      | 16px  | Default card padding, input padding, section gap  |
| `5`      | 20px  | Comfortable card padding, form field gaps         |
| `6`      | 24px  | Section internal padding, group gaps              |
| `8`      | 32px  | Between sections on a page                        |
| `10`     | 40px  | Large section gaps                                |
| `12`     | 48px  | Page top/bottom padding (web)                     |
| `16`     | 64px  | Major section separators (landing page)           |
| `20`     | 80px  | Landing page section gaps                         |

### 4.3 Layout Constants

```
WEB:
  sidebar-width-expanded:  256px (w-64)
  sidebar-width-collapsed: 72px
  header-height:           64px
  page-padding:            24px (desktop), 16px (mobile)
  max-content-width:       1280px
  card-gap:                16px
  form-field-gap:          20px

MOBILE:
  screen-padding-h:        16px
  screen-padding-v:        24px
  header-height:           56px
  tab-bar-height:          56px
  card-padding:            16px
  card-gap:                12px
  section-gap:             24px
  list-item-gap:           8px
  input-padding-v:         12px
  input-padding-h:         16px
```

---

## 5. Border Radius

| Token   | Value  | Usage                                                    |
|---------|--------|----------------------------------------------------------|
| `xs`    | 4px    | Tiny elements: badge dots, progress bar tracks           |
| `sm`    | 8px    | Buttons (small), chips, inputs, tags                     |
| `md`    | 12px   | Default cards, dropdowns, modals, inputs                 |
| `lg`    | 16px   | Large cards, hero sections, image containers             |
| `xl`    | 20px   | Feature cards, hero cards, large modals                  |
| `2xl`   | 24px   | Landing page cards, floating panels                      |
| `full`  | 9999px | Avatars, pill badges, circular buttons, toggle tracks    |

### Radius Rules

```
- Buttons: sm (8px) for default, full for pill variant
- Inputs: md (12px)
- Cards: lg (16px) on web, md (12px) on mobile
- Modals: xl (20px) on web, lg (16px) on mobile
- Avatars: always full
- Sidebar nav items: md (12px)
- Chips/Tags: full for pill, sm for rectangular
- Dropdowns: md (12px) on web
- Landing page feature cards: xl (20px) to 2xl (24px)
```

---

## 6. Shadow System

Shadows use the primary blue tint (not pure black) for cohesion with the brand.
Shadow color base: `#2E5FA2` (the brand blue) at very low opacity.

### 6.1 Web Shadows

| Token      | Value                                                                  | Usage                  |
|------------|------------------------------------------------------------------------|------------------------|
| `shadow-xs`  | `0 1px 2px rgba(46, 95, 162, 0.05)`                                 | Subtle lift: stat cards, badges |
| `shadow-sm`  | `0 1px 3px rgba(46, 95, 162, 0.08), 0 1px 2px rgba(46, 95, 162, 0.04)` | Default cards          |
| `shadow-md`  | `0 4px 8px -2px rgba(46, 95, 162, 0.08), 0 2px 4px -2px rgba(46, 95, 162, 0.04)` | Hover cards, dropdowns |
| `shadow-lg`  | `0 12px 20px -4px rgba(46, 95, 162, 0.10), 0 4px 8px -4px rgba(46, 95, 162, 0.04)` | Floating panels, popovers |
| `shadow-xl`  | `0 20px 32px -8px rgba(46, 95, 162, 0.14), 0 8px 16px -4px rgba(46, 95, 162, 0.06)` | Modals, dialogs        |

### 6.2 Mobile Shadows (React Native)

| Token | iOS shadowOffset Y | iOS shadowOpacity | iOS shadowRadius | Android elevation |
|-------|--------------------|--------------------|------------------|-------------------|
| `xs`  | 1                  | 0.05               | 2                | 1                 |
| `sm`  | 2                  | 0.08               | 4                | 2                 |
| `md`  | 4                  | 0.08               | 8                | 4                 |
| `lg`  | 8                  | 0.10               | 16               | 8                 |
| `xl`  | 16                 | 0.14               | 24               | 12                |

Shadow color (iOS): `#2E5FA2`

---

## 7. Component Specifications

### 7.1 Buttons

```
VARIANTS:
  primary     — bg: primary-600, text: white, hover: primary-700
                shadow-sm → shadow-md on hover
                The main CTA. One per visible area.

  secondary   — bg: white, text: primary-700, border: primary-200
                hover: bg primary-50, border primary-300
                For secondary actions alongside primary.

  outline     — bg: transparent, text: primary-600, border: neutral-300
                hover: bg neutral-50, border neutral-400
                For tertiary actions, cancel buttons.

  ghost       — bg: transparent, text: primary-600
                hover: bg primary-50
                Inline actions, "View All" links, compact actions.

  danger      — bg: error-main (#EF4444), text: white, hover: error-dark
                Destructive actions only (delete, remove).

  success     — bg: secondary-500 (#4CA626), text: white, hover: secondary-600
                Positive confirmations (approve, activate, complete).

SIZES:
  sm   — height: 36px, padding: 12px 16px, text: button-sm (13px), radius: sm (8px)
  md   — height: 44px, padding: 12px 20px, text: button-md (14px), radius: sm (8px)
  lg   — height: 52px, padding: 16px 28px, text: button-lg (15px), radius: md (12px)

STATES:
  default  — base style
  hover    — darken bg one step, lift shadow one tier
  active   — scale 0.97, darken bg two steps
  focus    — 3px ring primary-200, outline offset 2px
  disabled — opacity 0.5, cursor not-allowed, no hover effect
  loading  — spinner replaces text, same dimensions, no interaction
```

### 7.2 Cards

```
VARIANTS:
  default    — bg: white, border: 1px neutral-200, shadow: shadow-sm, radius: lg (16px)
               hover (if clickable): shadow-md, translateY -2px
               Padding: 20px (web), 16px (mobile)

  elevated   — bg: white, NO border, shadow: shadow-md, radius: lg
               hover: shadow-lg
               For featured content, hero cards

  outlined   — bg: transparent, border: 1px neutral-300, NO shadow, radius: lg
               hover: border primary-200, bg primary-50/30
               For selectable items (plans, options)

  sunken     — bg: neutral-100, border: none, shadow: none, radius: lg
               For grouped content, inset areas

ANATOMY:
  ┌──────────────────────────────────────┐
  │ [Icon/Image]        [Badge/Actions]  │  ← Header zone (optional)
  │                                      │
  │ Title Text                           │  ← heading-sm or heading-md
  │ Description or secondary info        │  ← body-md, neutral-600
  │                                      │
  │ ┌──────────┐ ┌──────────┐           │  ← Metric/content zone
  │ │ Metric 1 │ │ Metric 2 │           │
  │ └──────────┘ └──────────┘           │
  │                                      │
  │ [Action Button]  [Secondary Action]  │  ← Footer zone (optional)
  └──────────────────────────────────────┘

  Internal spacing: 16px gap between zones
  Header-to-content: 12px
  Content-to-footer: 16px
```

### 7.3 Inputs

```
DEFAULT STATE:
  height:       44px (web), 48px (mobile)
  padding:      12px 16px
  bg:           white (web), neutral-100 (mobile)
  border:       1px neutral-300
  radius:       md (12px)
  text:         body-md, neutral-900
  placeholder:  neutral-400

FOCUS STATE:
  border:       2px primary-500
  ring:         3px primary-100 (outer glow)
  bg:           white

ERROR STATE:
  border:       2px error-main
  ring:         3px error-light
  helper text:  body-sm, error-dark, appears below

DISABLED STATE:
  bg:           neutral-100
  text:         neutral-400
  border:       neutral-200
  cursor:       not-allowed

LABEL:
  text:         label-lg (14px Medium)
  color:        neutral-800
  margin-bottom: 6px

HELPER TEXT:
  text:         caption (12px Regular)
  color:        neutral-500 (default), error-dark (error)
  margin-top:   4px
```

### 7.4 Navigation — Sidebar (Web)

```
CONTAINER:
  width:        256px expanded, 72px collapsed
  bg:           white
  border-right: 1px neutral-200
  transition:   width 300ms ease

LOGO ZONE:
  padding:      20px
  border-bottom: 1px neutral-200
  Logo image:   36x36px rounded-lg (show clinic logo)
  Clinic name:  heading-sm, neutral-900
  Subtitle:     caption, neutral-500

SECTION LABEL:
  text:         overline (11px, uppercase, SemiBold)
  color:        neutral-400
  padding:      0 12px
  margin:       24px 0 8px 0 (first section: 16px 0 8px 0)

NAV ITEM:
  height:       40px
  padding:      8px 12px
  radius:       md (12px)
  gap:          12px (icon to text)
  text:         label-lg (14px Medium)
  icon:         18x18px

  default:      text neutral-500, icon neutral-400
  hover:        bg neutral-100, text neutral-700
  active:       bg primary-50, text primary-700, icon primary-600
                left 3px primary-600 bar indicator (rounded)

USER ZONE (bottom):
  padding:      16px 20px
  border-top:   1px neutral-200
  Avatar:       32px
  Name:         label-md, neutral-800
  Role:         caption, neutral-500
```

### 7.5 Navigation — Header (Web)

```
CONTAINER:
  height:       64px
  bg:           white (solid, NO transparency, NO backdrop-blur)
  border-bottom: 1px neutral-200
  padding:      0 24px
  position:     sticky top-0
  z-index:      30

LEFT ZONE:
  Mobile menu button (md:hidden)
  Breadcrumb or page title (optional)

RIGHT ZONE:
  gap: 8px between items
  Notification bell → User avatar/name → dropdown

DROPDOWN MENU:
  bg:           white
  border:       1px neutral-200
  radius:       md (12px)
  shadow:       shadow-lg
  padding:      6px
  z-index:      100

  Items:
    padding:    8px 12px
    radius:     sm (8px)
    text:       body-md, neutral-700
    hover:      bg neutral-100
    danger:     text error-main, hover bg error-light
```

### 7.6 Navigation — Tab Bar (Mobile)

```
CONTAINER:
  height:       56px
  bg:           white
  border-top:   1px neutral-200
  position:     fixed bottom-0
  padding:      0 8px

TAB ITEM:
  layout:       column, center-aligned
  icon:         24x24px (inactive), 24x24px (active)
  label:        10px Medium (caption)
  gap:          2px

  inactive:     icon neutral-400, text neutral-400
  active:       icon primary-600, text primary-600

ACTIVE INDICATOR:
  4px wide dot below icon, primary-600, radius full
  OR pill bg behind icon+label, primary-50
  (Choose ONE indicator style and use consistently)
```

### 7.7 Avatars

```
SIZES:
  xs:  24px  — Inline mentions, compact lists
  sm:  32px  — Table rows, small cards, comments
  md:  40px  — Default (nav, list items, headers)
  lg:  56px  — Profile cards, detail views
  xl:  80px  — Profile page hero, large cards
  2xl: 120px — Edit profile, onboarding

SHAPE:      Always circular (radius: full)
BORDER:     2px white (when on colored backgrounds)
FALLBACK:   Initials on gradient background
            gradient: primary-500 → primary-700 (blue)
            text: white, centered, SemiBold
            Size: 40% of avatar diameter

STATUS DOT:
  Size: 25% of avatar diameter (min 8px)
  Position: bottom-right, overlapping border
  Colors: success (online), neutral-400 (offline), warning (busy)
  Border: 2px white
```

### 7.8 Badges & Status

```
PILL BADGE:
  padding:      2px 10px
  radius:       full
  text:         label-sm (11px Medium), uppercase tracking-wide
  height:       22px

  Variants (by semantic meaning):
    active/success:   bg secondary-50, text secondary-700, dot secondary-500
    warning:          bg warning-light, text warning-dark, dot warning-main
    error/suspended:  bg error-light, text error-dark, dot error-main
    info:             bg primary-50, text primary-700, dot primary-500
    neutral/default:  bg neutral-100, text neutral-600, dot neutral-400

COUNT BADGE (notification):
  min-width:    18px
  height:       18px
  radius:       full
  bg:           error-main
  text:         10px Bold, white
  padding:      0 5px
```

### 7.9 Tables (Web)

```
CONTAINER:
  bg:           white
  border:       1px neutral-200
  radius:       lg (16px)
  overflow:     hidden (clip radius on rows)

HEADER ROW:
  bg:           neutral-50
  text:         label-sm (11px Medium), uppercase, neutral-500
  padding:      12px 16px
  border-bottom: 1px neutral-200
  Sortable: hover text neutral-700, active text primary-600

BODY ROW:
  padding:      14px 16px
  border-bottom: 1px neutral-100
  text:         body-md, neutral-700
  hover:        bg primary-50/40
  selected:     bg primary-50, left 3px primary-500 bar

PAGINATION:
  margin-top:   16px
  Showing "1-10 of 45"
  Prev/Next buttons: outline variant, sm size
  Page numbers: ghost buttons, active = primary-600 bg + white text
```

### 7.10 Modals (Web)

```
BACKDROP:
  bg:           neutral-950/50 (rgba(11, 16, 21, 0.5))
  backdrop-filter: blur(4px)

CONTAINER:
  bg:           white
  radius:       xl (20px)
  shadow:       shadow-xl
  max-width:    lg (512px) default, xl (640px) wide, 2xl (768px) extra-wide
  max-height:   85vh
  padding:      0

HEADER:
  padding:      20px 24px
  border-bottom: 1px neutral-200
  Title:        heading-lg, neutral-900
  Close button: 32x32, ghost, neutral-500, hover neutral-700

BODY:
  padding:      24px
  overflow-y:   auto

FOOTER:
  padding:      16px 24px
  border-top:   1px neutral-200
  Buttons right-aligned, gap 12px
```

---

## 8. Iconography

```
LIBRARY:       Lucide React (web), Lucide React Native or MaterialCommunityIcons (mobile)
STYLE:         Outline (1.5px stroke), rounded joins
DEFAULT SIZE:  20x20px in UI, 18x18px in nav, 16x16px inline with text, 24x24px in cards

ICON CONTAINERS (colored circle behind icon):
  sm:  36px container, 18px icon
  md:  48px container, 24px icon
  lg:  56px container, 28px icon

  Container: semantic-light bg (e.g., primary-50, secondary-50)
  Icon: semantic-main color (e.g., primary-600, secondary-500)
  Radius: lg (16px) for square-rounded, full for circular
```

---

## 9. Motion & Animation

### 9.1 Timing

```
INSTANT:    0ms        — Checkbox toggles, radio selects
FAST:       100ms      — Hover color changes, focus rings
NORMAL:     200ms      — Most transitions (default)
MODERATE:   300ms      — Sidebar expand/collapse, drawers, panels
SLOW:       500ms      — Page entrance animations
```

### 9.2 Easing

```
ease-default:   cubic-bezier(0.4, 0, 0.2, 1)    — General purpose
ease-in:        cubic-bezier(0.4, 0, 1, 1)       — Elements leaving
ease-out:       cubic-bezier(0, 0, 0.2, 1)       — Elements entering
ease-spring:    { type: 'spring', stiffness: 300, damping: 22 }  — Interactive elements
```

### 9.3 Patterns

```
HOVER LIFT (cards):
  transform: translateY(-2px)
  shadow: upgrade one tier (sm → md)
  duration: 200ms ease-default

BUTTON PRESS:
  transform: scale(0.97)
  duration: spring (fast settle)

PAGE ENTRANCE (content):
  opacity: 0 → 1
  transform: translateY(16px) → translateY(0)
  duration: 400ms ease-out
  Stagger: 50ms between items

DROPDOWN OPEN:
  opacity: 0 → 1
  transform: translateY(-4px) → translateY(0)
  duration: 150ms ease-out

MODAL OPEN:
  Backdrop: opacity 0 → 1, 200ms
  Content: scale(0.95) → scale(1) + opacity, 200ms ease-out

SIDEBAR COLLAPSE:
  width transition: 300ms ease-default
  Content opacity: fade out 100ms, fade in 100ms (after width settles)
```

---

## 10. Data Visualization (Charts)

```
CHART COLOR SEQUENCE (for multi-series data):
  1. #2E5FA2  (primary-600)    — First/main series
  2. #4CA626  (secondary-500)  — Second series
  3. #5488D0  (primary-400)    — Third series
  4. #6BC44E  (secondary-400)  — Fourth series
  5. #F59E0B  (warning-main)   — Fifth series
  6. #8B5CF6  (purple)         — Sixth series

CHART GRID:
  Lines: neutral-200 at 0.5px
  Text: caption (11px), neutral-500

CHART TOOLTIPS:
  bg: neutral-900
  text: white, body-sm
  radius: sm (8px)
  padding: 8px 12px
  shadow: shadow-lg

PIE/DONUT:
  Inner radius: 60% (donut style preferred over solid pie)
  Segment gap: 2px
  Label: inside if fits, outside with leader line if not
```

---

## 11. Responsive Breakpoints

```
WEB:
  sm:    640px    — Mobile landscape
  md:    768px    — Tablet portrait (sidebar appears)
  lg:    1024px   — Tablet landscape / small desktop
  xl:    1280px   — Desktop (max content width)
  2xl:   1536px   — Wide desktop

MOBILE (React Native):
  Small phone:   < 375px width
  Standard:      375-414px width
  Large phone:   > 414px width
  Tablet:        > 768px width
```

---

## 12. Accessibility Requirements

```
COLOR CONTRAST:
  - Body text (neutral-700) on page bg (neutral-50): minimum 7:1 ratio (AAA)
  - Heading text (neutral-900) on white: minimum 12:1 ratio
  - Primary button text (white) on primary-600: minimum 4.5:1 ratio
  - Link text (primary-600) on white: minimum 4.5:1 ratio
  - Never rely on color alone — always pair with icon, text, or pattern

FOCUS INDICATORS:
  - 3px ring, primary-200, offset 2px from element
  - Visible on all interactive elements
  - Never remove outlines without replacement

TOUCH TARGETS:
  - Minimum 44x44px on mobile
  - Minimum 36x36px on web
  - 8px minimum gap between adjacent targets

TEXT:
  - Minimum 11px font size
  - Minimum 1.4 line-height ratio for body text
  - Maximum 75 characters per line

MOTION:
  - Respect prefers-reduced-motion
  - Provide static fallbacks for all animations
```

---

## 13. Platform-Specific Notes

### 13.1 Web (React + Vite + Tailwind v4)

```
COLOR IMPLEMENTATION:
  Define all scales in @theme {} block in index.css.
  Use Tailwind classes: bg-primary-600, text-neutral-700, border-neutral-200, etc.

FONT LOADING:
  Google Fonts via <link> in index.html:
  - Inter: 400, 500, 600, 700, 800
  - Plus Jakarta Sans: 600, 700, 800

  @theme {
    --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
    --font-display: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
  }

NO DARK MODE:
  Light mode only. All dark: prefixed classes have been removed.
  The @custom-variant dark line has been removed from CSS.
```

### 13.2 Mobile (React Native 0.75.4)

```
COLOR IMPLEMENTATION:
  Update all values in BestoClinicMobile/src/theme/colors.ts
  Both light and dark mode palettes to be updated.
  Access via useTheme() hook: const { colors } = useTheme();

FONT LOADING:
  Inter font already installed and linked.
  Use platform font naming: Inter-Regular, Inter-Medium, Inter-SemiBold, Inter-Bold

SHADOWS:
  iOS: Use shadowColor with brand blue #2E5FA2
  Android: Use elevation (no color control)

STATUS BAR:
  Light mode: dark-content (dark icons on light bg)
  Dark mode: light-content (light icons on dark bg)
```

---

## 14. Key Screens — Design Direction

### 14.1 Website Landing Page

```
HERO:
  bg: gradient from primary-600 to primary-800 (blue gradient)
  Heading: display-xl, white
  Subheading: body-lg, white/80
  CTA: Large white button (stands out on blue bg)
  Secondary CTA: outline white button
  Right side: Product screenshot with shadow-xl, slight rotation (3deg)

FEATURE SECTIONS:
  Alternating: white bg / neutral-50 bg
  Each section: heading-lg + body-lg description + screenshot/illustration
  Section padding: 80px vertical

SOCIAL PROOF:
  Clinic logos in neutral-400 (muted), auto-scroll carousel
  Testimonial cards: elevated variant, customer photo + quote + name/role

PRICING:
  3-column cards, center card elevated + primary-600 "Popular" badge
  Toggle: Monthly/Annual with savings badge (secondary-500)
```

### 14.2 Clinic Dashboard (Tenant)

```
SIDEBAR:
  White bg, clean nav groups, clinic logo at top
  Active item: primary-50 bg + primary-600 text + left bar indicator

HEADER:
  White bg, solid (no blur), notification bell + user avatar

DASHBOARD GRID:
  Row 1: 4 stat cards (patients, appointments, revenue, queue)
         Each with icon container (colored), stat-value, trend badge
  Row 2: 2 columns — Appointment calendar + Recent activity feed
  Row 3: Revenue chart (area chart, primary-600 fill with gradient fade)

STAT CARDS:
  Icon containers use rotating semantic colors:
    Patients → primary (blue)
    Appointments → info (blue-light)
    Revenue → secondary (green)
    Queue → warning (amber)
```

### 14.3 Patient Portal

```
SIDEBAR (desktop):
  Simplified nav: Home, Appointments, Health, Payments, More
  Lighter feel than clinic dashboard (patients aren't power users)

MOBILE:
  Bottom tab bar: 5 tabs (Home, Appointments, Health, Payments, More)
  Each tab uses outline icon (inactive) → filled icon (active)

PATIENT DASHBOARD:
  Greeting header: "Good morning, [Name]" with avatar
  Upcoming appointment card (elevated, with doctor info + date + action)
  Quick actions row: Book, Prescriptions, Records, Emergency
  Recent prescriptions list
  Health metrics (if dental: next checkup countdown)
```

### 14.4 Mobile App

```
GENERAL:
  SafeArea handling with neutral-50 bg
  Pull-to-refresh on list screens
  Skeleton loading (pulse animation) matching card shapes
  Bottom sheet modals (not center modals on mobile)

HEADERS:
  56px height, white bg, center title, back arrow left, action right
  No gradient headers in the new design (clean and flat)
  Exception: Dashboard hero can use a subtle primary-50 tinted header

LISTS:
  Cards with 12px gap between items
  Swipe actions for quick operations (archive, complete)
  Empty states: illustration + heading + description + CTA

FORMS:
  One field per row (no side-by-side on mobile)
  Floating labels or above-field labels (not placeholder-as-label)
  Keyboard-aware scrolling
  Validation on blur, errors below field in error-dark text
```

---

## 15. Migration Checklist

When implementing this blueprint, update files in this order:

### Web
1. `website/src/index.css` — Replace all @theme color tokens with new scales
2. `website/index.html` — Update font imports if adding JetBrains Mono
3. `website/src/components/ui.jsx` — Update COLOR_MAP, component styles
4. `website/src/components/common/Button.jsx` — Update variant styles
5. `website/src/platform/components/shared.jsx` — Update shared components
6. Layout files (TenantLayout, PatientLayout, PlatformLayout) — Update classes
7. Individual page components — Update color/spacing/radius classes

### Mobile
1. `BestoClinicMobile/src/theme/colors.ts` — Replace all palette values
2. `BestoClinicMobile/src/theme/shadows.ts` — Update shadow color to brand blue
3. `BestoClinicMobile/src/theme/radius.ts` — Verify alignment with new scale
4. `BestoClinicMobile/src/components/ui/` — Update all 20 components
5. Screen files — Update individual screens

---

## 16. Quick Reference Card

```
PRIMARY BLUE:       #2E5FA2   — Main CTAs, active states, links
BRAND GREEN:        #4CA626   — Success, health, secondary CTAs
BODY TEXT:          #3D4A57   — Default readable text (NOT black)
HEADING TEXT:       #151E27   — Strong headings
PAGE BACKGROUND:    #F8FAFB   — Subtle off-white
CARD BACKGROUND:    #FFFFFF   — Clean white
CARD BORDER:        #E4E8EC   — Subtle neutral border
INPUT BORDER:       #CED4DA   — Neutral-300
FOCUS RING:         #D5E3F5   — Primary-100 (3px ring)
SECTION BG ALT:     #F1F4F6   — Alternating section bg

DISPLAY FONT:       Plus Jakarta Sans (headings)
BODY FONT:          Inter (everything else)
MONO FONT:          JetBrains Mono (codes/data)

CARD RADIUS:        16px (web), 12px (mobile)
BUTTON RADIUS:      8px
INPUT RADIUS:       12px
DEFAULT SHADOW:     0 1px 3px rgba(46,95,162,0.08)

DEFAULT TRANSITION: 200ms cubic-bezier(0.4, 0, 0.2, 1)
SPRING ANIMATION:   stiffness 300, damping 22
```

---

*This document is the single source of truth for all BestoClinic UI decisions.
Every component, every screen, every interaction should trace back to a token
or rule defined here. When in doubt, refer to this blueprint.*

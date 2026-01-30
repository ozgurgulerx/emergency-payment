# Frontend Styling & Formatting Guide

This document provides everything needed to replicate the "Obsidian Ledger" dark theme UI used in this portfolio optimizer application. Copy the specified files and follow the patterns below.

---

## Quick Start - Files to Copy

### Essential Files (Copy These First)

| File | Purpose |
|------|---------|
| `tailwind.config.ts` | Tailwind configuration with custom colors, animations |
| `app/globals.css` | CSS variables for light/dark themes |
| `app/layout.tsx` | Root layout with fonts and theme provider |
| `lib/utils.ts` | Utility functions including `cn()` for class merging |
| `components/providers/theme-provider.tsx` | Dark mode support |
| `components/ui/button.tsx` | Button component with variants |
| `components/ui/card.tsx` | Card component |
| `components/ui/badge.tsx` | Badge component |

### Package Dependencies

```json
{
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "next-themes": "^0.4.4",
    "framer-motion": "^11.15.0",
    "lucide-react": "^0.468.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "@radix-ui/react-slot": "^1.1.1"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.1",
    "tailwindcss-animate": "^1.0.7"
  }
}
```

---

## Design System

### Theme: "Obsidian Ledger" (Dark Mode)

A professional, finance-grade dark theme with gold accents.

#### Color Palette (HSL Values)

```css
/* Dark Theme */
--background: 225 15% 8%;        /* Deep navy-black */
--foreground: 40 10% 92%;        /* Warm off-white */
--card: 225 12% 11%;             /* Slightly lighter cards */
--muted-foreground: 40 5% 55%;   /* Subdued text */
--border: 225 10% 18%;           /* Subtle borders */

/* Accent Colors */
--gold: 43 60% 55%;              /* Primary gold accent (amber-500) */
--success: 142 71% 45%;          /* Green for success states */
--warning: 38 92% 50%;           /* Orange for warnings */
--destructive: 0 62% 50%;        /* Red for errors */

/* Surface Elevation */
--surface-1: 225 12% 11%;        /* Level 1 */
--surface-2: 225 11% 14%;        /* Level 2 */
--surface-3: 225 10% 17%;        /* Level 3 */
```

#### Typography

- **Sans font**: Inter (variable: `--font-sans`)
- **Mono font**: JetBrains Mono (variable: `--font-mono`)
- Base text: `text-foreground` (warm off-white)
- Muted text: `text-muted-foreground`
- Accent text: `text-amber-500` (gold)

---

## Common UI Patterns

### 1. Page Header

```tsx
<header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
  <div className="container mx-auto px-6 py-4 flex items-center justify-between">
    {/* Logo */}
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
        <span className="text-white font-bold text-lg">P</span>
      </div>
      <div>
        <span className="font-semibold text-lg">App Title</span>
        <span className="text-xs text-muted-foreground block">Subtitle</span>
      </div>
    </div>
    {/* Actions */}
    <Button variant="outline" size="sm">Action</Button>
  </div>
</header>
```

### 2. Card Component

```tsx
<div className="bg-card border border-border/30 rounded-xl p-6">
  <h3 className="font-semibold mb-4 flex items-center gap-2">
    <div className="w-2 h-2 rounded-full bg-amber-500" />
    Card Title
  </h3>
  {/* Content */}
</div>
```

### 3. Status Indicators

```tsx
// Running/Live status
<span className="relative flex h-2 w-2">
  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
</span>

// Static status dots
<div className="w-2 h-2 rounded-full bg-green-500" />  // Success
<div className="w-2 h-2 rounded-full bg-amber-500" />  // Warning/Active
<div className="w-2 h-2 rounded-full bg-red-500" />    // Error
<div className="w-2 h-2 rounded-full bg-gray-500" />   // Idle
```

### 4. Pills/Badges

```tsx
// Colored badge
<span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
  Label
</span>

// Neutral badge
<span className="text-xs px-2 py-0.5 rounded-full bg-surface-2">
  Label
</span>
```

### 5. Buttons

```tsx
// Primary (gold)
<Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
  Primary Action
</Button>

// Secondary (outline)
<Button variant="outline" size="sm">
  Secondary
</Button>

// Success
<Button className="bg-green-500 hover:bg-green-600">
  Success
</Button>
```

### 6. Progress Bar

```tsx
<div className="h-1 bg-surface-2 rounded-full overflow-hidden">
  <div
    className="h-full bg-amber-500 transition-all"
    style={{ width: `${progress}%` }}
  />
</div>
```

### 7. Section Dividers

```tsx
<div className="h-4 w-px bg-border" />  // Vertical
<div className="border-t border-border/30" />  // Horizontal
```

---

## Animation Patterns

### Using Framer Motion

```tsx
import { motion, AnimatePresence } from "framer-motion";

// Fade in + slide up
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
>
  Content
</motion.div>

// Scale in (for badges, notifications)
<motion.div
  initial={{ scale: 0.9, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
>
  Badge
</motion.div>

// List stagger
{items.map((item, i) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: i * 0.05 }}
  >
    {item.content}
  </motion.div>
))}
```

### CSS Animations (from tailwind.config.ts)

```tsx
// Subtle pulse
<div className="animate-pulse-subtle">...</div>

// Slide up on mount
<div className="animate-slide-up">...</div>

// Ring pulse (for live indicators)
<div className="animate-pulse-ring">...</div>
```

---

## Layout Patterns

### 3-Column Dashboard

```tsx
<main className="container mx-auto px-6 py-6">
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-180px)]">
    {/* Left Panel */}
    <div className="bg-card border border-border/30 rounded-xl p-4">
      ...
    </div>

    {/* Center Panel */}
    <div className="bg-card border border-border/30 rounded-xl p-4">
      ...
    </div>

    {/* Right Panel */}
    <div className="bg-card border border-border/30 rounded-xl p-4">
      ...
    </div>
  </div>
</main>
```

### Form/Stepper Layout

```tsx
<div className={`grid ${showSidebar ? "grid-cols-1 lg:grid-cols-2 gap-8" : "grid-cols-1 max-w-3xl mx-auto"}`}>
  {/* Main Content */}
  <div className="space-y-6">...</div>

  {/* Sidebar (conditional) */}
  <AnimatePresence>
    {showSidebar && (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="lg:border-l border-border/30 lg:pl-8"
      >
        ...
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

---

## Component Examples

### Status Banner

```tsx
<div className={`p-3 rounded-lg ${
  status === "running"
    ? "bg-amber-500/10 border border-amber-500/20"
    : status === "completed"
    ? "bg-green-500/10 border border-green-500/20"
    : status === "failed"
    ? "bg-red-500/10 border border-red-500/20"
    : "bg-surface-2 border border-border/30"
}`}>
  <div className="flex items-center gap-2">
    {status === "running" && <LiveDot />}
    <span className="text-sm font-medium">
      {status.toUpperCase()}
    </span>
  </div>
  <p className="text-sm text-muted-foreground mt-1">{message}</p>
</div>
```

### Timeline Card

```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  className="rounded-lg border p-3 border-blue-500/30 bg-blue-500/5"
>
  <div className="flex items-start justify-between">
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground mb-1">
          {timestamp}
          <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-2 text-xs">
            {label}
          </span>
        </div>
        <p className="text-sm">{content}</p>
      </div>
    </div>
    <button className="p-1 hover:bg-surface-2 rounded">
      <ChevronDown className="w-4 h-4" />
    </button>
  </div>
</motion.div>
```

---

## Key Style Classes Reference

| Purpose | Classes |
|---------|---------|
| Page background | `bg-background min-h-screen` |
| Card | `bg-card border border-border/30 rounded-xl p-6` |
| Muted text | `text-muted-foreground text-sm` |
| Gold accent text | `text-amber-500` |
| Subtle border | `border-border/30` |
| Surface levels | `bg-surface-1`, `bg-surface-2`, `bg-surface-3` |
| Backdrop blur header | `bg-background/80 backdrop-blur-sm` |
| Gold gradient | `bg-gradient-to-r from-amber-500 to-orange-500` |
| Shadow with color | `shadow-lg shadow-amber-500/20` |

---

## File Structure

```
frontend/
├── app/
│   ├── globals.css          # Theme CSS variables
│   ├── layout.tsx           # Root layout with fonts
│   └── page.tsx             # Landing page example
├── components/
│   ├── providers/
│   │   └── theme-provider.tsx
│   └── ui/
│       ├── button.tsx
│       ├── card.tsx
│       ├── badge.tsx
│       ├── tabs.tsx
│       └── scroll-area.tsx
├── lib/
│   └── utils.ts             # cn() utility
└── tailwind.config.ts       # Tailwind config
```

---

## Implementation Checklist

1. [ ] Copy `tailwind.config.ts` and install `tailwindcss-animate` plugin
2. [ ] Copy `app/globals.css` with CSS variables
3. [ ] Copy `lib/utils.ts` for the `cn()` function
4. [ ] Install dependencies: `next-themes`, `framer-motion`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`
5. [ ] Copy `components/providers/theme-provider.tsx`
6. [ ] Set up `app/layout.tsx` with Inter and JetBrains Mono fonts
7. [ ] Copy UI components from `components/ui/`
8. [ ] Use dark mode by default: `defaultTheme="dark"` in ThemeProvider

---

## Prompt for AI Implementation

> Create a Next.js 15 application with the "Obsidian Ledger" dark theme. Use:
> - Tailwind CSS with custom color tokens (background: navy-black #12141a, foreground: warm off-white, gold accent: amber-500)
> - next-themes for dark mode (default to dark)
> - Framer Motion for animations (fade-in, slide-up patterns)
> - Lucide React icons
> - Inter font (sans) and JetBrains Mono (mono)
> - shadcn/ui-style components with class-variance-authority
>
> Key design patterns:
> - Cards with subtle borders (border-border/30) and rounded-xl
> - Status indicators with colored dots and animate-pulse for live states
> - Pills/badges with colored backgrounds (bg-{color}-500/10) and borders
> - Headers with backdrop-blur-sm and sticky positioning
> - Gold gradient buttons for primary actions
> - Surface elevation using surface-1, surface-2, surface-3 levels

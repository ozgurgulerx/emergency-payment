# Emergency Payment Runbook - UI/UX Specification

A premium "Ops Runbook Terminal" interface for enterprise treasury operations.

## Design System: "Obsidian Ledger"

### Visual Identity
- **Primary Theme**: Dark mode default (Obsidian Ledger)
- **Aesthetic**: Bloomberg Terminal meets modern fintech
- **Typography**: Inter (sans) + JetBrains Mono (mono)
- **Accent Color**: Gold/Amber (#C9A227)

### Color Palette (Dark Mode)

```css
--background: #121418;        /* Deep charcoal */
--foreground: #E8E4DC;        /* Warm off-white */
--card: #1A1C22;              /* Elevated surface */
--border: #2A2D36;            /* Subtle borders */
--gold: #C9A227;              /* Primary accent */
--surface-1: #1A1C22;         /* Level 1 elevation */
--surface-2: #22242A;         /* Level 2 elevation */
--surface-3: #2A2D36;         /* Level 3 elevation */

/* Status Colors */
--success: #22C55E;           /* Green - RELEASE/CLEAR */
--warning: #F59E0B;           /* Amber - HOLD/ESCALATE */
--error: #EF4444;             /* Red - BLOCK/REJECT */
--info: #3B82F6;              /* Blue - Processing */
```

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Header (h-14)                                   │
│  [Logo] Emergency Payment Runbook          [Project: ozgurguler-7212] [⚙️]  │
├────────────────────────────┬────────────────────────────────────────────────┤
│                            │                                                │
│     Chat Panel (flex-1)    │           Workflow Panel (w-96)               │
│                            │                                                │
│  ┌──────────────────────┐  │  ┌──────────────────────────────────────────┐ │
│  │                      │  │  │         Agent Status Cards               │ │
│  │   Conversation       │  │  │                                          │ │
│  │   Thread             │  │  │  ┌────────────────────────────────────┐  │ │
│  │   (ScrollArea)       │  │  │  │ 🛡️ Sanctions Screening             │  │ │
│  │                      │  │  │  │    Status: COMPLETED ✓              │  │ │
│  │                      │  │  │  │    Decision: CLEAR (100%)           │  │ │
│  │   [User Message]     │  │  │  │    tool_run_id: run_abc123          │  │ │
│  │   [Assistant Msg]    │  │  │  └────────────────────────────────────┘  │ │
│  │   [User Message]     │  │  │                                          │ │
│  │   [Assistant Msg]    │  │  │  ┌────────────────────────────────────┐  │ │
│  │        ...           │  │  │  │ 💧 Liquidity Screening              │  │ │
│  │                      │  │  │  │    Status: RUNNING 🔄               │  │ │
│  │                      │  │  │  │    Checking buffer thresholds...    │  │ │
│  │                      │  │  │  └────────────────────────────────────┘  │ │
│  │                      │  │  │                                          │ │
│  └──────────────────────┘  │  │  ┌────────────────────────────────────┐  │ │
│                            │  │  │ 📋 Operational Procedures           │  │ │
│  ┌──────────────────────┐  │  │  │    Status: PENDING ○                │  │ │
│  │    Message Input     │  │  │  │    Waiting for liquidity result... │  │ │
│  │  [textarea........]  │  │  │  └────────────────────────────────────┘  │ │
│  │              [Send]  │  │  │                                          │ │
│  └──────────────────────┘  │  └──────────────────────────────────────────┘ │
│                            │                                                │
│                            │  ┌──────────────────────────────────────────┐ │
│                            │  │        Decision Memo (Collapsible)       │ │
│                            │  └──────────────────────────────────────────┘ │
│                            │                                                │
│                            │  ┌──────────────────────────────────────────┐ │
│                            │  │        Trace Drawer (Expandable)         │ │
│                            │  └──────────────────────────────────────────┘ │
├────────────────────────────┴────────────────────────────────────────────────┤
│                              Footer (h-8)                                    │
│     Powered by Azure AI Foundry | Project: ozgurguler-7212                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Header Bar

```tsx
<header className="h-14 border-b border-border/30 bg-surface-1 flex items-center justify-between px-6">
  {/* Logo */}
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600
                    flex items-center justify-center shadow-lg shadow-amber-500/20">
      <Zap className="w-5 h-5 text-white" />
    </div>
    <div>
      <h1 className="font-semibold text-lg">Emergency Payment Runbook</h1>
      <span className="text-xs text-muted-foreground">Treasury Operations</span>
    </div>
  </div>

  {/* Project Badge */}
  <Badge variant="gold" className="gap-1">
    <Building2 className="w-3 h-3" />
    ozgurguler-7212
  </Badge>
</header>
```

### 2. Chat Panel

#### Message Bubbles

**User Message:**
```tsx
<div className="flex justify-end gap-3">
  <div className="max-w-[80%] bg-gold/10 border border-gold/20 rounded-xl px-4 py-3">
    <p className="text-sm">{message}</p>
    <span className="text-xs text-muted-foreground mt-2">{timestamp}</span>
  </div>
  <Avatar className="h-8 w-8 bg-gold/20">
    <AvatarFallback className="text-gold">
      <User className="h-4 w-4" />
    </AvatarFallback>
  </Avatar>
</div>
```

**Assistant Message:**
```tsx
<div className="flex gap-3">
  <Avatar className="h-8 w-8 bg-surface-3">
    <AvatarFallback className="text-muted-foreground">
      <Bot className="h-4 w-4" />
    </AvatarFallback>
  </Avatar>
  <div className="max-w-[80%] bg-surface-2 border border-border rounded-xl px-4 py-3">
    <div className="markdown-content text-sm">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
    <span className="text-xs text-muted-foreground mt-2">{timestamp}</span>
  </div>
</div>
```

#### Input Area

```tsx
<div className="border-t border-border/30 p-4 bg-surface-1">
  <div className="relative">
    <textarea
      className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 pr-12
                 text-sm placeholder:text-muted-foreground resize-none
                 focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold/50
                 min-h-[52px] max-h-[200px]"
      placeholder="Enter payment details or ask about emergency procedures..."
    />
    <Button
      variant="gold"
      size="icon"
      className="absolute right-2 bottom-2 h-8 w-8"
    >
      <Send className="h-4 w-4" />
    </Button>
  </div>
</div>
```

### 3. Agent Status Cards

#### Card States

**Pending:**
```tsx
<div className="p-4 rounded-lg border border-border bg-surface-2">
  <div className="flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center">
      <Shield className="w-4 h-4 text-muted-foreground" />
    </div>
    <div className="flex-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Sanctions Screening</span>
        <span className="w-2 h-2 rounded-full bg-gray-500" />
      </div>
      <p className="text-xs text-muted-foreground">Waiting to start...</p>
    </div>
  </div>
</div>
```

**Running:**
```tsx
<div className="p-4 rounded-lg border border-amber-500/50 bg-amber-500/5 relative overflow-hidden">
  {/* Scanning animation */}
  <motion.div
    className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent"
    animate={{ top: ["0%", "100%", "0%"] }}
    transition={{ duration: 2, repeat: Infinity }}
  />

  <div className="flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
      <Droplets className="w-4 h-4 text-amber-500" />
    </div>
    <div className="flex-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Liquidity Screening</span>
        <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
      </div>
      <p className="text-xs text-amber-400">Checking buffer thresholds...</p>
    </div>
  </div>
</div>
```

**Completed - Success:**
```tsx
<div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
  <div className="flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
      <Shield className="w-4 h-4 text-emerald-500" />
    </div>
    <div className="flex-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Sanctions Screening</span>
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      </div>
      <Badge variant="success" className="mt-1 text-[10px]">CLEAR</Badge>
      <p className="text-xs text-muted-foreground mt-1">No sanctions match found</p>
      <p className="text-[10px] text-muted-foreground font-mono mt-1">
        run_id: run_abc123
      </p>
    </div>
  </div>
</div>
```

**Completed - Warning:**
```tsx
<div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
  {/* Similar structure with amber colors */}
  <Badge variant="warning">BREACH</Badge>
  <p className="text-xs text-muted-foreground">Buffer breach: -$125,000</p>
</div>
```

**Completed - Error:**
```tsx
<div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5">
  {/* Similar structure with red colors */}
  <Badge variant="error">BLOCK</Badge>
  <p className="text-xs text-muted-foreground">OFAC SDN match detected</p>
</div>
```

### 4. Decision Memo Panel

```tsx
<Card className="mt-4">
  <CardHeader className="pb-2">
    <div className="flex items-center justify-between">
      <CardTitle className="text-sm flex items-center gap-2">
        <FileText className="w-4 h-4" />
        Decision Memo
      </CardTitle>
      <Badge
        variant={decision === 'RELEASE' ? 'success' : decision === 'REJECT' ? 'error' : 'warning'}
      >
        {decision}
      </Badge>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Payment Summary */}
    <div className="p-3 rounded-lg bg-surface-2">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Amount:</span>
          <span className="ml-2 font-semibold text-gold">${amount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Beneficiary:</span>
          <span className="ml-2">{beneficiary}</span>
        </div>
      </div>
    </div>

    {/* Rationale */}
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-2">RATIONALE</h4>
      <ul className="space-y-1 text-sm">
        {rationale.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <ChevronRight className="w-3 h-3 mt-1 text-gold" />
            {item}
          </li>
        ))}
      </ul>
    </div>

    {/* Approvals Required */}
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-2">APPROVALS REQUIRED</h4>
      <div className="space-y-2">
        {approvals.map((approval, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded bg-surface-2">
            <span className="text-sm">{approval.role}</span>
            <Badge variant="outline" className="text-[10px]">
              SLA: {approval.sla_hours}h
            </Badge>
          </div>
        ))}
      </div>
    </div>

    {/* Citations */}
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-2">CITATIONS</h4>
      <div className="space-y-2">
        {citations.map((citation, i) => (
          <div key={i} className="p-2 rounded bg-surface-2 text-xs">
            <span className="text-gold">[{i + 1}]</span> {citation.source}
            <p className="text-muted-foreground mt-1 italic">"{citation.snippet}"</p>
          </div>
        ))}
      </div>
    </div>

    {/* Actions */}
    <div className="flex gap-2 pt-2">
      <Button variant="outline" size="sm" className="flex-1">
        <Copy className="w-3 h-3 mr-1" />
        Copy Audit Bundle
      </Button>
      <Button variant="gold" size="sm" className="flex-1">
        <ExternalLink className="w-3 h-3 mr-1" />
        Open in Portal
      </Button>
    </div>
  </CardContent>
</Card>
```

### 5. Trace Drawer

```tsx
<Sheet>
  <SheetTrigger asChild>
    <Button variant="ghost" size="sm" className="w-full mt-2">
      <Terminal className="w-3 h-3 mr-2" />
      View Raw Events ({events.length})
    </Button>
  </SheetTrigger>
  <SheetContent side="right" className="w-[500px]">
    <SheetHeader>
      <SheetTitle>SSE Event Trace</SheetTitle>
      <SheetDescription>Raw workflow events for debugging</SheetDescription>
    </SheetHeader>
    <ScrollArea className="h-[calc(100vh-120px)] mt-4">
      <div className="space-y-2 font-mono text-xs">
        {events.map((event, i) => (
          <div
            key={i}
            className={`p-2 rounded border ${
              event.type === 'error' ? 'border-red-500/30 bg-red-500/5' :
              event.type === 'final' ? 'border-gold/30 bg-gold/5' :
              'border-border bg-surface-2'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <Badge variant="outline" className="text-[9px]">{event.type}</Badge>
              <span className="text-muted-foreground">{event.elapsed_ms}ms</span>
            </div>
            <pre className="whitespace-pre-wrap text-[10px]">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </ScrollArea>
  </SheetContent>
</Sheet>
```

---

## Animations

### Step Transitions

```tsx
// Agent card entry
<motion.div
  initial={{ opacity: 0, x: 20 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.3 }}
>
```

### Progress Pulse

```tsx
// Running state indicator
<motion.div
  className="w-2 h-2 rounded-full bg-amber-500"
  animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
  transition={{ duration: 1, repeat: Infinity }}
/>
```

### Success Celebration

```tsx
// Completion checkmark
<motion.div
  initial={{ scale: 0 }}
  animate={{ scale: 1 }}
  transition={{ type: "spring", stiffness: 200, damping: 10 }}
>
  <CheckCircle2 className="text-emerald-500" />
</motion.div>
```

### Scanning Effect

```tsx
// Running card scanner line
<motion.div
  className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent"
  animate={{ top: ["0%", "100%", "0%"] }}
  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
/>
```

---

## Visual Status Cues

| State | Border Color | Background | Icon Color | Badge |
|-------|--------------|------------|------------|-------|
| Pending | `border` | `surface-2` | `muted-foreground` | - |
| Running | `amber-500/50` | `amber-500/5` | `amber-500` | - |
| CLEAR/RELEASE | `emerald-500/30` | `emerald-500/5` | `emerald-500` | Green |
| HOLD/ESCALATE | `amber-500/30` | `amber-500/5` | `amber-500` | Amber |
| BLOCK/REJECT | `red-500/30` | `red-500/5` | `red-500` | Red |
| Error | `red-500/50` | `red-500/10` | `red-500` | Red |

---

## Additional Features

### 1. Replay Run from History

```tsx
<Button variant="outline" size="sm" onClick={() => replayRun(run_id)}>
  <RotateCcw className="w-3 h-3 mr-1" />
  Replay
</Button>
```

### 2. Copy Audit Bundle JSON

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    navigator.clipboard.writeText(JSON.stringify(decisionPacket, null, 2));
    toast.success("Audit bundle copied to clipboard");
  }}
>
  <Copy className="w-3 h-3 mr-1" />
  Copy Audit Bundle
</Button>
```

### 3. Quick Actions

```tsx
<div className="flex flex-wrap gap-2">
  <Button variant="outline" size="sm" onClick={() => setInput("Process payment...")}>
    <ChevronRight className="w-3 h-3 mr-1" />
    Sample Payment
  </Button>
  <Button variant="outline" size="sm" onClick={() => setInput("Screen BANK MASKAN...")}>
    <Shield className="w-3 h-3 mr-1" />
    Test Sanctions Block
  </Button>
  <Button variant="outline" size="sm" onClick={() => setInput("Check liquidity for $500K...")}>
    <Droplets className="w-3 h-3 mr-1" />
    Test Breach
  </Button>
</div>
```

---

## Responsive Design

### Breakpoints

- **Desktop (≥1280px)**: Full 3-column layout
- **Tablet (≥768px)**: Chat + collapsible workflow panel
- **Mobile (<768px)**: Stacked layout with tabs

### Mobile Adaptations

- Workflow panel becomes bottom sheet
- Agent cards stack vertically
- Decision memo becomes full-screen modal
- Simplified trace view

---

## Accessibility

- WCAG AA compliant contrast ratios
- Keyboard navigation for all interactive elements
- Screen reader announcements for status changes
- Focus indicators on all interactive elements
- Reduced motion option respected

---

## Performance

- Virtualized message list for long conversations
- Lazy loading for trace events
- Debounced input
- Optimistic UI updates
- SSE reconnection with backoff

---

*Design System: Obsidian Ledger v1.0*
*Last Updated: 2026-01-30*

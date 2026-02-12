# Theme — Command Center UI

> Phase 0 placeholder. No UI yet, but this documents how the Command Center will eventually consume cleaning status and match the Host Mojo brand.

## How the Command Center Consumes Cleaning Status

The Command Center is the host-facing dashboard that shows real-time turnover status. It will:

1. **Poll or subscribe** to the Maid Triage API for turnover status updates
2. **Display turnovers** grouped by property with color-coded status badges
3. **Show cleaner assignments** with ETA and progress indicators
4. **Surface alerts** for urgent situations (no-show, tight turnaround, unassigned)

## Host Mojo Theme Variables

The UI should inherit from the Host Mojo design system. Expected theme tokens:

```css
/* TODO: Import actual Host Mojo theme variables */
--hm-primary: #???;        /* Brand primary */
--hm-secondary: #???;      /* Brand secondary */
--hm-success: #???;        /* Completed / on-track */
--hm-warning: #???;        /* Attention needed */
--hm-danger: #???;         /* Urgent / overdue */
--hm-surface: #???;        /* Card / panel background */
--hm-text-primary: #???;   /* Primary text */
--hm-text-muted: #???;     /* Secondary text */
--hm-radius: ???px;        /* Border radius */
--hm-font-family: '???';   /* Font stack */
```

## Status Color Mapping

| Turnover Status | Color Token | Meaning |
|----------------|-------------|---------|
| `pending` | `--hm-warning` | Awaiting cleaner assignment |
| `assigned` | `--hm-primary` | Cleaner assigned, not started |
| `in_progress` | `--hm-primary` | Cleaning underway |
| `completed` | `--hm-success` | Cleaning finished |
| `cancelled` | `--hm-text-muted` | Turnover cancelled |

## TODO

- [ ] Get actual Host Mojo theme tokens from the main repo
- [ ] Design Command Center wireframes
- [ ] Define WebSocket vs polling strategy for real-time updates
- [ ] Create component library for status badges, timeline, property cards
- [ ] Responsive design requirements (mobile-first for cleaners)

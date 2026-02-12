# Traceability Matrix

Maps every requirement to its code location, test coverage, and telemetry events.

## Legend

- **Req ID**: Internal requirement identifier
- **Code**: Source file(s) implementing the requirement
- **Tests**: Test file(s) covering it (U = unit, I = integration, E = eval)
- **Telemetry**: Events emitted when this requirement executes

---

## Core Requirements

| Req ID | Description | Code | Tests | Telemetry Events |
|--------|-------------|------|-------|------------------|
| REQ-001 | Multi-tenant isolation — all queries scoped by company_id | `src/dal/*.ts` (every DAL method) | U: `tenant-isolation.test.ts` | — |
| REQ-002 | Booking event creates cleaning task | `src/services/booking-handler.service.ts` | U: `booking-handler.test.ts`, E: `back-to-back-success`, `booking-extension-reschedule` | `task.created` |
| REQ-003 | Booking cancellation cascades to task | `src/services/booking-handler.service.ts` | U: `booking-handler.test.ts`, E: `cancel-booking-cancels-task` | `task.canceled` |
| REQ-004 | Booking extension reschedules task | `src/services/booking-handler.service.ts` | U: `booking-handler.test.ts`, E: `booking-extension-reschedule` | `task.rescheduled` |
| REQ-005 | Dispatch assigns primary cleaner | `src/services/dispatch.service.ts` | U: `cleaning-tasks.test.ts`, E: `back-to-back-success` | `task.assigned`, `service.span(dispatchTask)` |
| REQ-006 | Cleaner accept confirms assignment | `src/services/dispatch.service.ts` | U: `cleaning-tasks.test.ts`, E: `back-to-back-success` | `task.confirmed`, `service.span(acceptTask)` |
| REQ-007 | Cleaner check-in transitions to in_progress | `src/services/dispatch.service.ts` | U: `cleaning-tasks.test.ts`, E: `back-to-back-success` | `task.checked_in`, `service.span(checkInTask)` |
| REQ-008 | Task completion triggers payment request | `src/services/dispatch.service.ts`, `src/services/payment.service.ts` | U: `cleaning-tasks.test.ts`, E: `back-to-back-success` | `task.completed`, `payment.requested`, `service.span(completeTask)` |
| REQ-009 | State machine enforces valid transitions only | `src/dal/cleaning-task.dal.ts` (VALID_TRANSITIONS) | U: `cleaning-task.test.ts` (parameterized) | — |
| REQ-010 | No-show detection: unconfirmed past deadline | `src/services/no-show.service.ts` | U: `no-show.test.ts`, E: `primary-no-show-backup` | `incident.created(NO_SHOW)` |
| REQ-011 | No-show: backup cleaner dispatch | `src/services/no-show.service.ts`, `src/services/dispatch.service.ts` | U: `no-show.test.ts`, E: `primary-no-show-backup` | `task.backup_assigned`, `service.span(dispatchToBackup)` |
| REQ-012 | No-show ladder: T+10 remind primary | `src/services/no-show-ladder.service.ts` | U: `no-show-ladder.test.ts`, E: `no-show-ladder-escalation` | `ladder.remind_primary` |
| REQ-013 | No-show ladder: T+20 switch to backup | `src/services/no-show-ladder.service.ts` | U: `no-show-ladder.test.ts`, E: `no-show-ladder-escalation` | `ladder.switch_backup` |
| REQ-014 | No-show ladder: T+40 emergency request | `src/services/no-show-ladder.service.ts` | U: `no-show-ladder.test.ts` | `ladder.emergency_request` |
| REQ-015 | No-show ladder: T+60 host manual intervention | `src/services/no-show-ladder.service.ts` | U: `no-show-ladder.test.ts` | `ladder.host_manual` |
| REQ-016 | Ladder idempotency — skip already-fired steps | `src/services/no-show-ladder.service.ts` | U: `no-show-ladder.test.ts` (idempotency test) | — |
| REQ-017 | Emergency cleaning request | `src/services/emergency.service.ts`, `src/api/phase4.ts` | U: `emergency.test.ts`, `phase4.test.ts` | `emergency.clean_requested` |
| REQ-018 | Cleaning manifest retrieval (placeholder-safe) | `src/services/cleaning-manifest.service.ts`, `src/dal/cleaning-manifest.dal.ts` | U: `cleaning-manifest.test.ts`, `phase4.test.ts` | — |
| REQ-019 | Outbox pattern for all side-effects | `src/dal/outbox.dal.ts`, all services that call `outboxDal.create()` | U: `stub-adapters.test.ts` | — |
| REQ-020 | Rollup metrics (on-time rate, no-show count, payment total) | `src/dal/cleaning-rollup.dal.ts`, `src/services/cleaning-rollup.service.ts` | U: `cleaning-rollup.test.ts`, `cleaning-tasks.test.ts` | — |

## Integration Gateway Requirements

| Req ID | Description | Code | Tests | Telemetry Events |
|--------|-------------|------|-------|------------------|
| REQ-030 | PMS adapter interface + stub | `src/integrations/interfaces/pms.ts`, `src/integrations/adapters/stub-pms.ts` | U: `stub-adapters.test.ts`, `validation.test.ts` | — |
| REQ-031 | Turno adapter interface + stub | `src/integrations/interfaces/cleaning-vendor.ts`, `src/integrations/adapters/stub-turno.ts` | U: `stub-adapters.test.ts`, `validation.test.ts` | — |
| REQ-032 | Breezeway adapter interface + stub | `src/integrations/interfaces/cleaning-vendor.ts`, `src/integrations/adapters/stub-breezeway.ts` | U: `stub-adapters.test.ts`, `validation.test.ts` | — |
| REQ-033 | Handy adapter interface + stub | `src/integrations/interfaces/cleaning-vendor.ts`, `src/integrations/adapters/stub-handy.ts` | U: `stub-adapters.test.ts`, `validation.test.ts` | — |
| REQ-034 | GHL adapter interface + stub | `src/integrations/interfaces/ghl.ts`, `src/integrations/adapters/stub-ghl.ts` | U: `stub-adapters.test.ts`, `validation.test.ts` | — |
| REQ-035 | Notification adapter interface + stub | `src/integrations/interfaces/notification.ts`, `src/integrations/adapters/stub-notification.ts` | U: `stub-adapters.test.ts`, `validation.test.ts` | — |
| REQ-036 | Zod validation on all integration payloads | `src/integrations/validation.ts` | U: `validation.test.ts` | — |

## Observability Requirements (Phase 5)

| Req ID | Description | Code | Tests | Telemetry Events |
|--------|-------------|------|-------|------------------|
| REQ-050 | Request ID middleware on all routes | `src/api/middleware/request-context.ts` | U: `request-context.test.ts` | `api.request.start`, `api.request.end` |
| REQ-051 | Structured log fields (request_id, company_id, route, status_code, duration_ms) | `src/api/middleware/request-context.ts` | U: `request-context.test.ts` | `api.request.end` (with duration_ms) |
| REQ-052 | Service span telemetry with duration | `src/services/dispatch.service.ts` (logSpan) | E: all scenarios (emit `service.span` events) | `service.span` |
| REQ-053 | Telemetry aggregation: p50/p95 latency | `src/services/telemetry-aggregation.service.ts` | U: `telemetry-aggregation.test.ts` | — |
| REQ-054 | Telemetry aggregation: incident counts | `src/services/telemetry-aggregation.service.ts` | U: `telemetry-aggregation.test.ts` | — |
| REQ-055 | Eval harness: DB reset, seed, scenario run, JSON report | `eval/runner.ts`, `eval/scenarios/*.json` | `npm run eval` → `eval/report.json` | — |
| REQ-056 | Eval golden files for regression detection | `eval/goldens/*.golden.json` | Compared by eval runner assertions | — |
| REQ-057 | Telemetry dashboard (HTML) | `src/api/telemetry.ts` | U: `phase4.test.ts` (status=200 check) | — |

## Seed & Data Integrity

| Req ID | Description | Code | Tests | Telemetry Events |
|--------|-------------|------|-------|------------------|
| REQ-060 | Deterministic seed: 2 PMCs, 10 properties each | `prisma/seed.ts` | U: `seed-validation.test.ts` | `seed.completed` |
| REQ-061 | Every property has primary + backup cleaner | `prisma/seed.ts` | U: `seed-validation.test.ts` | — |
| REQ-062 | Tasks created for every non-canceled booking | `prisma/seed.ts` | U: `seed-validation.test.ts` | — |
| REQ-063 | No secrets in committed code | `.env.example`, `src/services/cleaning-manifest.service.ts` | U: `cleaning-manifest.test.ts` (no plaintext codes) | — |

## UI Coverage (Phase UI)

| Req ID | Description | Code | Tests | Telemetry Events |
|--------|-------------|------|-------|------------------|
| REQ-UI-001 | Command Center dark theme matching Host Mojo brand | `ui/app/globals.css` | `ui npm run build` (compile check) | — |
| REQ-UI-002 | Reusable UI primitives (Card, MetricCard, StatusBadge, Button, LoadingSpinner) | `ui/components/ui/*.tsx` | `ui npm run build` | — |
| REQ-UI-003 | Header tab navigation (5 pages) | `ui/components/layout/DashboardShell.tsx` | `ui npm run build` | — |
| REQ-UI-004 | Global filter bar (scope, company, property, date range) | `ui/components/FilterBar.tsx`, `ui/lib/filter-context.tsx` | `ui npm run build` | — |
| REQ-UI-005 | Turnovers page — task table grouped by property with status badges | `ui/app/(dashboard)/turnovers/page.tsx` | `ui npm run build` | Reads `GET /companies/:id/cleaning/tasks` |
| REQ-UI-006 | Task detail drawer (schedule, cleaner, vendor, payment, IDs) | `ui/app/(dashboard)/turnovers/page.tsx` (TaskDetailDrawer) | `ui npm run build` | — |
| REQ-UI-007 | At-Risk display state (client-side from task status + timing) | `ui/lib/types.ts` (getDisplayState) | `ui npm run build` | — |
| REQ-UI-008 | Dispatch & Exceptions page — actionable queue | `ui/app/(dashboard)/dispatch/page.tsx` | `ui npm run build` | Reads tasks + incidents |
| REQ-UI-009 | Exception buttons create outbox actions (emergency, escalation, notify) | `ui/app/(dashboard)/dispatch/page.tsx` | `ui npm run build` | `POST /cleaning/emergency-request` |
| REQ-UI-010 | Vendors page — cleaner roster with coverage, reliability, assignments | `ui/app/(dashboard)/vendors/page.tsx` | `ui npm run build` | Reads `GET /companies/:id/cleaners` |
| REQ-UI-011 | Automation & ROI page — MetricCards with documented formulas | `ui/app/(dashboard)/roi/page.tsx` | `ui npm run build` | Reads rollup + incidents |
| REQ-UI-012 | Telemetry page — events table + outbox status counts | `ui/app/(dashboard)/telemetry/page.tsx` | `ui npm run build` | Reads `GET /telemetry/events`, `GET /telemetry/outbox-summary` |
| REQ-UI-013 | PII redaction — names display as "First L." format | `ui/app/(dashboard)/turnovers/page.tsx`, `dispatch/page.tsx`, `vendors/page.tsx` | `ui npm run build` | — |
| REQ-UI-014 | UI calls API only — never imports Prisma/DAL | `ui/lib/api.ts` (all calls via fetch) | Architecture constraint; no Prisma in `ui/` deps | — |
| REQ-UI-015 | New backend API endpoints for UI data | `src/api/ui-data.ts` | Backend `npm run check` (lint + typecheck + 187 tests) | — |
| REQ-UI-016 | Demo seed data — today's turnovers with all scenarios | `prisma/seed.ts` (UI Demo Scenarios section) | `npm run db:seed` | `seed.completed(ui-demo)` |
| REQ-UI-017 | 30s polling on task pages, 5min on rollup, 60s on telemetry | `ui/app/(dashboard)/*.tsx` (setInterval in useEffect) | Runtime behavior | — |

---

## How to Investigate a Production Incident

### 1. Get the request_id

Every API response includes a `request_id` in the structured logs. If you have a timestamp, query the events table:

```sql
SELECT * FROM events WHERE type = 'api.request.start' AND created_at >= '...' ORDER BY created_at DESC LIMIT 20;
```

### 2. Trace the full request lifecycle

Once you have a `request_id`, pull all events for that request:

```sql
SELECT type, payload_json, duration_ms, entity_type, entity_id, created_at
FROM events WHERE request_id = '<request_id>' ORDER BY created_at ASC;
```

This shows: `api.request.start` -> service spans -> `api.request.end` with duration.

### 3. Investigate a specific cleaning task

Find all events and incidents for a task:

```sql
-- Events (telemetry trail)
SELECT type, payload_json, duration_ms, created_at FROM events
WHERE entity_type = 'cleaning_task' AND entity_id = '<task_id>' ORDER BY created_at ASC;

-- Incidents
SELECT type, severity, description, created_at FROM incidents
WHERE task_id = '<task_id>' ORDER BY created_at ASC;

-- Outbox actions
SELECT type, status, payload_json, attempts, created_at FROM outbox
WHERE company_id = '<company_id>' AND payload_json LIKE '%<task_id>%' ORDER BY created_at ASC;
```

### 4. No-show ladder investigation

Check which ladder steps fired for a task:

```sql
SELECT type, payload_json, created_at FROM events
WHERE entity_type = 'cleaning_task' AND entity_id = '<task_id>' AND type LIKE 'ladder.%'
ORDER BY created_at ASC;
```

Expected sequence: `ladder.remind_primary` (T+10) -> `ladder.switch_backup` (T+20) -> `ladder.emergency_request` (T+40) -> `ladder.host_manual` (T+60).

### 5. Check system health

```sql
-- Latency percentiles (last 1000 timed events)
SELECT durationMs FROM events WHERE duration_ms IS NOT NULL ORDER BY duration_ms ASC LIMIT 1000;

-- Incident counts by type (last 30 days)
SELECT type, COUNT(*) as cnt FROM incidents WHERE created_at >= datetime('now', '-30 days') GROUP BY type ORDER BY cnt DESC;

-- Outbox backlog
SELECT status, COUNT(*) FROM outbox GROUP BY status;
```

### 6. Key files for debugging

| Area | File | Purpose |
|------|------|---------|
| Request tracing | `src/api/middleware/request-context.ts` | Assigns request_id, logs start/end |
| State transitions | `src/dal/cleaning-task.dal.ts` | VALID_TRANSITIONS map |
| No-show detection | `src/services/no-show.service.ts` | Confirm deadline check |
| Escalation ladder | `src/services/no-show-ladder.service.ts` | T+10/20/40/60 steps |
| Emergency fallback | `src/services/emergency.service.ts` | Marketplace request |
| Payment flow | `src/services/payment.service.ts` | Post-completion payment |
| Telemetry dashboard | `GET /telemetry` | HTML dashboard with events + latency |
| Triage config | `src/config/triage.ts` | All timeout/threshold constants |

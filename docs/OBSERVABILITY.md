# Observability

## Current State (Phase 5)

### Structured Logging
- **Pino** (Fastify built-in) with JSON output in production, pino-pretty in development
- Every request gets a unique `request_id` via the `request-context` middleware
- Structured fields on every log line: `requestId`, `companyId`, `route`, `method`, `statusCode`, `durationMs`

### Telemetry Events Table
Every significant action writes a row to the `events` table with:
- `type` — event category (e.g., `api.request.end`, `service.span`, `task.completed`)
- `request_id` — correlates all events within a single API request
- `company_id` — tenant scope
- `span` — sub-operation label (e.g., `dispatchTask`, `acceptTask`)
- `duration_ms` — operation latency in milliseconds
- `entity_type` / `entity_id` — links events to business entities (e.g., `cleaning_task`)

### Request Lifecycle Events
| Event | When | Key Data |
|-------|------|----------|
| `api.request.start` | Request received | route, method, requestId |
| `api.request.end` | Response sent | route, statusCode, durationMs |

### Service Span Events
| Event | When | Key Data |
|-------|------|----------|
| `service.span` | Service method completes | span name, durationMs |

### Business Events
| Event | When |
|-------|------|
| `task.created` | Booking handler creates cleaning task |
| `task.assigned` | Primary cleaner dispatched |
| `task.backup_assigned` | Backup cleaner dispatched after no-show |
| `task.confirmed` | Cleaner accepts assignment |
| `task.checked_in` | Cleaner starts cleaning |
| `task.completed` | Cleaning finished |
| `task.canceled` | Booking canceled |
| `task.rescheduled` | Booking extended |
| `payment.requested` | Payment outbox entry created |
| `ladder.remind_primary` | T+10 no-show reminder |
| `ladder.switch_backup` | T+20 backup switch |
| `ladder.emergency_request` | T+40 emergency request |
| `ladder.host_manual` | T+60 manual intervention alert |
| `emergency.clean_requested` | Emergency cleaning created |

### Telemetry Aggregation
- **p50/p95 latency**: Computed from all events with `duration_ms` via `computePercentiles()`
- **Incident counts by type**: Aggregated over configurable date range via `getIncidentCounts()`
- **Dashboard**: HTML page at `GET /telemetry` showing latency stats, incident counts, recent events

### Timing Helpers
- `startTimer(label)` wraps `performance.now()` for measuring any operation
- Returns `{ stop(): number }` — call `.stop()` to get elapsed ms

## Eval Harness
- `npm run eval` resets a separate `eval.db`, seeds deterministic data, runs 5 scenario scripts
- Produces `eval/report.json` with pass/fail status and per-assertion details
- Golden files in `eval/goldens/` define expected outputs for regression detection

## TODO (Phase 6+)

- [ ] OpenTelemetry exporter for production APM (Datadog, New Relic, etc.)
- [ ] Error rate alerting thresholds
- [ ] Outbox processing metrics (queue depth, failure rate)
- [ ] Real-time WebSocket events for the Command Center dashboard

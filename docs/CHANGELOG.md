# Changelog — Host Mojo Maid Triage System

All notable changes to this project are documented in this file.

---

## [0.6.0-rc.1] — Phase 6: Security & Integration Readiness (Release Candidate)

> **Tag: `v0.6.0-rc.1`**
>
> This is a release candidate. Do not merge to Host Mojo until `npm run check` passes.

### Added

- **TenantContext enforcement**: Every API route extracts a `TenantContext` object
  from the validated `:companyId` path parameter using `buildTenantContext()`.
  Services receive the tenant context rather than raw strings.
- **Shared ID schemas**: `companyIdSchema` and `entityIdSchema` (Zod) validate
  all IDs at the API boundary (1-64 chars, non-empty).
- **Date range validation**: `validateDateRange()` enforces `dateFrom < dateTo`
  and a maximum span of 366 days on all list and rollup queries.
- **Status enum validation**: Task list endpoint now accepts only the 6 valid
  status values (`scheduled`, `assigned`, `in_progress`, `completed`, `canceled`, `failed`).
- **Cross-tenant negative tests**: 42 new tests in `tests/unit/api/cross-tenant.test.ts`
  proving tenant isolation across all write and read endpoints, including:
  - Company B cannot accept/check-in/complete Company A tasks
  - Company B cannot see Company A manifests or rollup data
  - Emergency requests with cross-tenant propertyId are properly isolated
- **Input validation tests**: Date range clamping, invalid status rejection,
  empty companyId rejection, emergency body validation, SQL injection prevention.
- **`npm run check`**: Single command runs lint + typecheck + test + eval.
- **docs/SECURITY.md**: Full Phase 6 security document covering tenant isolation,
  auth plan, webhook signature verification, logging redaction, secrets strategy,
  input validation inventory, dependency policy, data protection, OWASP review.
- **docs/COMMAND_CENTER_INTEGRATION.md**: Complete integration guide for the
  Command Center dashboard with endpoints, example payloads, polling cadence
  recommendations, rollup scopes, and UX state definitions.
- **docs/GATEWAY_CHANGE_PLAN.md**: Final pass adding outbox type inventory
  and integration readiness checklist.
- **docs/CHANGELOG.md**: This file.

### Changed

- Existing test date ranges narrowed from 731 days to 366 days to comply with
  the new `MAX_DATE_RANGE_DAYS` validation.
- Route param schemas now use shared `companyIdSchema` / `entityIdSchema` instead
  of inline `z.string().min(1)`.
- README updated: Phase 6 status, merge gate instructions, documentation index,
  phase history table.

### Security

- All API routes now thread `TenantContext` through service calls.
- Date range clamping prevents unbounded DB queries.
- Status enum validation prevents arbitrary string injection into queries.
- ID length limits prevent excessively long path parameters.
- No new dependencies added.

---

## [0.5.0] — Phase 5: Observability

### Added

- Request context middleware (`request_id` + `company_id` on every request)
- Structured telemetry events with `service.span` duration tracking
- Telemetry aggregation service (p50/p95 latency, incident counts)
- HTML telemetry dashboard at `/telemetry`
- Eval harness with 5 scenarios and golden file regression detection
- `docs/TRACEABILITY.md` — requirement-to-code-to-test mapping
- `docs/ARCHITECTURE.md` — system diagrams
- 145 tests passing

---

## [0.4.0] — Phase 4: No-Show Ladder + Emergency Cleaning

### Added

- No-show detection service (cleaner confirmation timeout)
- 4-step no-show escalation ladder (remind → backup → emergency → manual)
- Emergency cleaning service with incident + outbox creation
- Cleaning manifest service with placeholder access codes
- Payment service with outbox-based payment requests
- Runbooks: `RUNBOOK_NO_SHOW.md`, `RUNBOOK_EMERGENCY_CLEAN.md`, `RUNBOOK_LATE_CHECKOUT.md`

---

## [0.2.0] — Phase 2: Integration Gateway

### Added

- 6 adapter interfaces (PMS, Turno, Breezeway, Handy, GHL, Notification)
- 6 stub adapters writing outbox rows
- Zod validation schemas for all webhook/request payloads
- OutboxDal with idempotency key deduplication
- OpenAPI-compatible JSON schemas in `docs/CONTRACTS/schemas/`
- `docs/GATEWAY_CHANGE_PLAN.md`
- 56 tests passing

---

## [0.1.0] — Phase 1: Data Model

### Added

- 9 Prisma models (Company, Property, Cleaner, CleanerProperty, Booking,
  CleaningTask, Incident, CleaningManifest, Outbox)
- Seed script (2 PMCs x 10 properties with cleaners, bookings, tasks)
- CleaningTask state machine (scheduled → assigned → in_progress → completed)
- Cleaning rollup DAL with on-time rate, no-show count, payment totals
- 28 tests passing

---

## [0.0.1] — Phase 0: Bootstrap

### Added

- Fastify 5 server with `/health` and `/version` endpoints
- Prisma ORM with SQLite (dev)
- Events table for telemetry
- `logEvent` helper (non-fatal, fire-and-forget)
- Full tooling: TypeScript, ESLint, Prettier, Vitest
- `.env.example` with all required env vars

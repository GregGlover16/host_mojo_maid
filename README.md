# Host Mojo Maid Triage System

Automated cleaning turnover scheduling, dispatch, and recovery for short-term rental hosts — U.S. only, multi-tenant.

## What is this?

This is the **Maid Triage System** for Host Mojo. It automatically:
- Schedules cleaning turnovers when guests check out
- Dispatches cleaners based on availability and proximity
- Tracks cleaning progress in real-time
- Recovers from issues (no-shows, cancellations) with automatic reassignment

This repo is **separate** from the main Host Mojo application and will be merged once all tests, telemetry, and security checks pass.

## Current Status: Phase 6 (Security & Integration Readiness)

> **Do not merge to Host Mojo until `npm run check` passes.**

Phase 6 completes the hardening cycle:
- Multi-tenant isolation proven by cross-tenant negative tests
- Input validation everywhere (Zod schemas, date range clamping, ID format checks)
- TenantContext extracted per request and threaded through all services
- Security documentation complete (see `docs/SECURITY.md`)
- Integration plan for Command Center + Gateway finalized

### Merge Gate

Before merging into Host Mojo, **all four quality gates must pass**:

```bash
npm run check
```

This runs: `lint` → `typecheck` → `test` → `eval`

If any step fails, **do not merge**. Fix the issue first.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Create database + generate Prisma client
npx prisma db push
npx prisma generate

# Seed dev data (2 PMCs, 10 properties each)
npm run db:seed

# Start dev server (hot reload)
npm run dev

# Run full quality gate
npm run check
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run check` | **Full quality gate**: lint + typecheck + test + eval |
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled output |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript compiler check |
| `npm test` | Run Vitest |
| `npm run eval` | Run scenario-based evals (5 scenarios) |
| `npm run db:seed` | Seed dev database |
| `npm run db:studio` | Open Prisma Studio |

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **Server:** Fastify 5
- **ORM:** Prisma (SQLite dev, Postgres prod)
- **Validation:** Zod
- **Logging:** Pino (Fastify built-in)
- **Testing:** Vitest
- **Linting:** ESLint + Prettier

## Architecture

```
Fastify Route → Service Layer → DAL (Prisma) → SQLite/Postgres
                     ↓
              Integration Adapters (Turno, Breezeway, Handy, PMS, GHL)
                     ↓
              Outbox Table (safe retry for side-effects)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, data model, sequence diagrams |
| [SECURITY.md](docs/SECURITY.md) | Tenant isolation, auth, validation, secrets strategy |
| [COMMAND_CENTER_INTEGRATION.md](docs/COMMAND_CENTER_INTEGRATION.md) | Dashboard endpoints, payloads, polling, UX states |
| [GATEWAY_CHANGE_PLAN.md](docs/GATEWAY_CHANGE_PLAN.md) | Integration Gateway changes needed |
| [TRACEABILITY.md](docs/TRACEABILITY.md) | Requirement-to-code-to-test mapping |
| [OBSERVABILITY.md](docs/OBSERVABILITY.md) | Telemetry, latency SLIs, dashboard |

## Phases Completed

| Phase | Name | Status |
|-------|------|--------|
| 0 | Bootstrap | COMPLETE |
| 1 | Data Model + CRUD | COMPLETE |
| 2 | Integration Gateway | COMPLETE |
| 4 | No-Show Ladder + Emergency | COMPLETE |
| 5 | Observability | COMPLETE |
| 6 | Security & Integration Readiness | COMPLETE (Release Candidate) |

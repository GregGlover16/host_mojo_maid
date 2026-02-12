# Host Mojo Maid Triage System

Automated cleaning turnover scheduling, dispatch, and recovery for short-term rental hosts — U.S. only, multi-tenant.

## What is this?

This is the **Maid Triage System** for Host Mojo. It automatically:
- Schedules cleaning turnovers when guests check out
- Dispatches cleaners based on availability and proximity
- Tracks cleaning progress in real-time
- Recovers from issues (no-shows, cancellations) with automatic reassignment

This repo is **separate** from the main Host Mojo application and will be merged once all tests, telemetry, and security checks pass.

## Current Status: Release Candidate (All Phases Complete)

> **Do not merge to Host Mojo until `npm run check` passes.**

All development phases are complete:
- Multi-tenant isolation proven by cross-tenant negative tests
- Input validation everywhere (Zod schemas, date range clamping, ID format checks)
- TenantContext extracted per request and threaded through all services
- Security documentation complete (see `docs/SECURITY.md`)
- Command Center UI with 5 dashboard pages (see UI section below)
- 187 tests passing, 5/5 eval scenarios green

### Merge Gate

Before merging into Host Mojo, **all four quality gates must pass**:

```bash
npm run check
```

This runs: `lint` → `typecheck` → `test` → `eval`

If any step fails, **do not merge**. Fix the issue first.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env

# 3. Create database + generate Prisma client
npx prisma db push
npx prisma generate

# 4. Seed dev data (2 PMCs, 10 properties each)
npm run db:seed

# 5. Start the backend API server (Terminal 1)
npm run dev
# → Fastify API running at http://localhost:3000

# 6. Start the Command Center UI (Terminal 2)
cd ui
npm install
npm run dev
# → Next.js UI running at http://localhost:3001

# 7. Open the UI in your browser
#    http://localhost:3001
```

> **Important:** You need **two terminals** running simultaneously. The backend
> API runs on port 3000 and the Next.js UI runs on port 3001 (auto-selected).
> The UI proxies all `/api/*` requests to the backend automatically.

## Command Center UI

The **Maid Triage Command Center** is a Next.js dashboard in the `ui/` folder.
It connects to the Fastify backend API and provides a real-time operational view.

### Starting the UI

Make sure the backend is running first (`npm run dev` from the project root),
then in a **separate terminal**:

```bash
cd ui
npm install   # first time only
npm run dev
```

Open **http://localhost:3001** in your browser. The root page redirects to `/turnovers`.

### UI Pages

| Page | URL | Description |
|------|-----|-------------|
| **Turnovers** | `/turnovers` | All cleaning tasks grouped by property. Click a row to open the detail drawer with lifecycle timeline, vendor badge, photo placeholder, and full task details. |
| **Dispatch** | `/dispatch` | Exception queue — no-shows, late cleaners, at-risk tasks. Escalation ladder timeline (T+0 → T+60m). Action buttons: Emergency Clean, Send Escalation, Notify Host. |
| **Vendors** | `/vendors` | Vendor integration cards (Turno, Breezeway, Handy) with connection status. Cleaner roster with reliability scores, active/inactive breakdown, primary & backup property assignments. |
| **ROI** | `/roi` | Hero metrics with icons — time saved, cost savings, coverage rate, on-time rate. Secondary metrics, payment breakdown, incident severity table, formula documentation. |
| **Telemetry** | `/telemetry` | Outbox status (pending/sent/failed). Event log with type/company/request ID/duration/payload. |

### UI Features

- **Command Center layout** — top header with Host Mojo logo + tab navigation (matches Command Center styling exactly)
- **Vendor badges** — color-coded per vendor (Turno=purple, Breezeway=teal, Handy=orange, In-House=gray)
- **Lifecycle timeline** — visual step indicator in task detail drawer (Scheduled → Assigned → Confirmed → In Progress → Completed)
- **Escalation ladder** — visual timeline on Dispatch page showing automated response steps
- **Photo verification placeholder** — completed/verified tasks show photo upload area
- **Company selector** — switch between PMCs (multi-tenant)
- **Property filter** — narrow to a specific property
- **Date range picker** — filter turnovers and rollups by date
- **Auto-refresh** — data polls automatically (30s turnovers, 30s dispatch, 5min ROI, 1min telemetry)
- **Dark theme** — exact Host Mojo Command Center colors (`#0a0f1a` bg, `#111827` cards, `#3b82f6` accent)
- **Detail drawer** — click any turnover row to see full task details
- **PII protection** — cleaner names are redacted to first name + last initial

### How it works

The Next.js app is configured with a [rewrite rule](ui/next.config.ts) that proxies
`/api/*` requests to `http://localhost:3000/*` (the Fastify backend). The UI never
talks to the database directly — all data flows through the backend API.

## Commands

### Backend (from project root)

| Command | Purpose |
|---------|---------|
| `npm run check` | **Full quality gate**: lint + typecheck + test + eval |
| `npm run dev` | Start backend API with hot reload (port 3000) |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled output |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript compiler check |
| `npm test` | Run Vitest |
| `npm run eval` | Run scenario-based evals (5 scenarios) |
| `npm run db:seed` | Seed dev database (2 PMCs, 10 properties, vendor assignments) |
| `npm run db:studio` | Open Prisma Studio |

### UI (from `ui/` directory)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js UI with hot reload (port 3001) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint for UI code |

## Tech Stack

### Backend
- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **Server:** Fastify 5
- **ORM:** Prisma (SQLite dev, Postgres prod)
- **Validation:** Zod
- **Logging:** Pino (Fastify built-in)
- **Testing:** Vitest
- **Linting:** ESLint + Prettier

### UI (Command Center)
- **Framework:** Next.js 16 (App Router)
- **React:** 19
- **Styling:** Tailwind CSS 4
- **Language:** TypeScript

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

## Seed Data

The seed script (`npm run db:seed`) creates realistic demo data:

- **2 PMCs** — Pine Coast PM (Maine) and Sunshine Ops (Orlando)
- **10 properties** per PMC with varied sizes (1–5 BR)
- **5–6 cleaners** per PMC with reliability scores
- **~90 days of bookings** with turnovers in various states
- **Vendor assignments** — ~40% In-House, ~26% Turno, ~27% Breezeway, ~8% Handy
- **Today's demo turnovers** — 5 completed, 2 in-progress, 3 late, 2 no-shows, 2 emergency
- **Incidents** — NO_SHOW, DAMAGE, SUPPLIES across both companies

## Phases Completed

| Phase | Name | Status |
|-------|------|--------|
| 0 | Bootstrap | COMPLETE |
| 1 | Data Model + CRUD | COMPLETE |
| 2 | Integration Gateway | COMPLETE |
| 4 | No-Show Ladder + Emergency | COMPLETE |
| 5 | Observability | COMPLETE |
| 6 | Security & Integration Readiness | COMPLETE (Release Candidate) |
| UI | Command Center Dashboard | COMPLETE |

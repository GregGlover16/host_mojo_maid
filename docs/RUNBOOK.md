# Runbook

> Operational procedures for the Maid Triage System.

## Development Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd host_mojo_maid

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env

# 4. Create database and generate Prisma client
npx prisma db push
npx prisma generate

# 5. Seed the database
npm run db:seed

# 6. Start dev server
npm run dev
```

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript compiler checks |
| `npm test` | Run all tests |
| `npm run db:seed` | Seed database with synthetic data |
| `npm run db:studio` | Open Prisma Studio (DB browser) |

## Database: Seed & Reset

### Seed the database

```bash
npm run db:seed
```

This creates:
- 2 companies: "Pine Coast PM" (Maine) and "Sunshine Ops" (Orlando)
- 10 properties per company with realistic sizes
- 4–6 cleaners per company, mapped to properties (primary + backup)
- Bookings over the last 60 days and next 30 days (with cancellations and extensions)
- Cleaning tasks for non-canceled bookings
- Incidents: at least one NO_SHOW, DAMAGE, and SUPPLIES per company

The seed is idempotent — it clears all existing data before inserting.

### Reset the database

To drop and recreate the database from scratch:

```bash
npx prisma db push --force-reset
npm run db:seed
```

Note: `--force-reset` destroys all data. Only use on development databases.

### View data in Prisma Studio

```bash
npm run db:studio
```

Opens a browser UI at `http://localhost:5555` to browse and edit records.

## Verification Checklist

After a seed or schema change, run:

```bash
npm run typecheck   # TypeScript compiles cleanly
npm run lint        # No ESLint errors
npm test            # All tests pass
```

## Running Backend + UI Together

The Maid Triage system consists of a Fastify backend API and a Next.js Command Center UI.

### Start the backend (port 3000)

```bash
# From repo root
npm run dev
```

### Start the UI (port 3001)

```bash
cd ui
npm run dev
```

The UI runs on `http://localhost:3001` and proxies all `/api/*` requests to the backend on port 3000 via Next.js rewrites.

### Quick start (both at once)

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: UI
cd ui && npm run dev
```

### Seed with demo data

The seed script creates demo turnovers for today (required for the UI to show useful data):

```bash
npx prisma db push --force-reset  # optional: fresh DB
npm run db:seed
```

This creates per company:
- 5 completed + verified turnovers (morning)
- 2 in-progress turnovers (current)
- 3 late cleaners (at risk — assigned but unconfirmed, past start time)
- 2 no-show failures with incidents
- 2 emergency clean requests (outbox pending)

### UI Development

```bash
cd ui
npm run dev      # Dev server with hot reload
npm run build    # Production build
npm run lint     # ESLint
```

### Verify everything

```bash
# Backend checks (from repo root)
npm run check    # lint + typecheck + test + eval

# UI checks (from ui/)
cd ui && npm run build   # TypeScript + build
```

## TODO (Phase 7+)

- [ ] Production deployment procedure
- [ ] Database migration procedure (Prisma migrate)
- [ ] Incident response playbook
- [ ] Rollback procedures
- [ ] Monitoring and alerting setup
- [ ] UI smoke tests with seeded DB

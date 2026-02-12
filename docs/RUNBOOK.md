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

## TODO (Phase 2+)

- [ ] Production deployment procedure
- [ ] Database migration procedure (Prisma migrate)
- [ ] Incident response playbook
- [ ] Rollback procedures
- [ ] Monitoring and alerting setup

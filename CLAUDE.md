# CLAUDE.md — Host Mojo Maid Triage System (Command Center Ops)

You are Claude Code working inside the `host_mojo_maid` repo.

## What we're building (plain English)
We are building the **Maid Triage System** for Host Mojo: software that automatically schedules, dispatches, tracks, and recovers short-term-rental cleaning turnovers for remote hosts in the **U.S. only**, across multiple Property Management Companies (PMCs) and properties.

This repo must stay **separate** from the main Host Mojo repo until:
- all tests pass,
- telemetry is in place,
- and security / multi-tenant isolation checks pass.

## Non-negotiables
- **Multi-tenant isolation is a contract.** Every record and every query must be scoped to `company_id` (PMC) and, where applicable, `property_id`.
- **Deterministic business logic > cleverness.** Use an LLM only where it is truly needed (e.g., message drafting). Core scheduling/reassignment logic must be deterministic and testable.
- **No secrets committed.** Use `.env.example`. Never log secrets.
- **No silent failures.** Every error path must log a structured event and return a safe fallback.
- **Small, reversible commits.** Make changes in small steps and keep a clean git history.

## Repo architecture (must follow)
- UI (if any) must not talk directly to the DB.
- API routes call a **service layer**.
- Services call a **DAL (data access layer)**.
- External vendors (Turno/Breezeway/Handy/PMS/GHL) are accessed only through **adapter interfaces** under `src/integrations/*`.
- All outbound side-effects (notify cleaner, call vendor, create payment request) must be written to an **outbox table** so we can retry safely.

## Commands you should run constantly
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run eval` (scenario-based eval runner)

## How to behave
- After each major implementation step, run the full test suite.
- If tests fail, fix immediately before adding new features.
- Keep explanations in plain English in code comments and docs (assume a junior dev is reading).

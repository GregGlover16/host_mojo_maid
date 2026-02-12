# Security

> Phase 6 — Security Hardening Pass for the Maid Triage System.
>
> This document describes every security control currently in place,
> the threat each control mitigates, and what is planned but not yet
> implemented. If a section says **Current** it is enforced in code today.
> If it says **Planned** it is a TODO tracked in the backlog.

---

## Table of Contents

1. [Tenant Isolation Model](#1-tenant-isolation-model)
2. [Authentication](#2-authentication-current--planned)
3. [Webhook Signature Verification Plan](#3-webhook-signature-verification-plan)
4. [Logging and Redaction Rules](#4-logging-and-redaction-rules)
5. [Secrets Strategy](#5-secrets-strategy)
6. [Input Validation](#6-input-validation)
7. [Dependency Security](#7-dependency-security)
8. [Data Protection](#8-data-protection)
9. [Future Work / TODO](#9-future-work--todo)

---

## 1. Tenant Isolation Model

**Status: Current (enforced in code)**

Multi-tenant isolation is the single most critical security invariant in this
system. Every Property Management Company (PMC) is a tenant. Data belonging
to one PMC must never be visible to, or modifiable by, another PMC.

### How it works

| Layer | Enforcement |
|-------|-------------|
| **Prisma schema** | Every table except `companies` has a `company_id` foreign key column pointing to the `companies` table. See `prisma/schema.prisma`. |
| **DAL (Data Access Layer)** | Every DAL method that reads or writes tenant data takes `companyId` as a **required** parameter. There is no DAL method that operates across tenants. See `src/dal/cleaning-task.dal.ts`, `src/dal/outbox.dal.ts`, `src/dal/incident.dal.ts`, `src/dal/cleaning-manifest.dal.ts`, `src/dal/cleaning-rollup.dal.ts`. |
| **Route params** | Every tenant-scoped API route includes `:companyId` in the URL path (`/companies/:companyId/...`). The value is extracted and validated with Zod before any data access occurs. See `src/api/cleaning-tasks.ts`. |
| **TenantContext** | A `TenantContext` object (`{ companyId: string }`) is built at the API boundary by `buildTenantContext()` (defined in `src/types/common.ts`) and threaded through every service call. Services never derive `companyId` from any other source. |
| **Request middleware** | The request-context middleware (`src/api/middleware/request-context.ts`) extracts `companyId` from route params and attaches it to the Fastify request for structured logging. Every log line and telemetry event includes `company_id`. |
| **Indexes** | Every tenant-scoped table has a `@@index([companyId])` to ensure queries scoped by tenant perform efficiently and never fall back to full-table scans. |

### Cross-tenant negative tests

The test suite includes explicit cross-tenant isolation tests in
`tests/unit/dal/tenant-isolation.test.ts`. These tests:

- Seed data for two separate PMCs (Company A and Company B).
- Verify that querying bookings by Company A's `companyId` returns zero
  records belonging to Company B (and vice versa).
- Verify the same isolation for cleaning tasks and cleaners.
- Verify that outbox entries created by one tenant's adapter are scoped to
  that tenant (tested in `tests/unit/integrations/stub-adapters.test.ts`).

Additional isolation tests exist in
`tests/unit/api/cleaning-tasks.test.ts` under the
"Multi-tenant isolation for task APIs" describe block.

### Postgres migration recommendation

When this system migrates from SQLite (dev) to PostgreSQL (production), we
strongly recommend adding **row-level security (RLS)** policies as a
defense-in-depth layer:

```sql
-- Example: cleaning_tasks RLS policy
ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON cleaning_tasks
  USING (company_id = current_setting('app.current_company_id'))
  WITH CHECK (company_id = current_setting('app.current_company_id'));
```

RLS provides a database-level safety net: even if application code contains
a bug that forgets to filter by `company_id`, the database itself will
prevent cross-tenant data leakage. The application should set
`app.current_company_id` at the beginning of each request via
`SET LOCAL app.current_company_id = '...'` inside the transaction.

---

## 2. Authentication (Current + Planned)

### Current: Auth Stub

| Aspect | Detail |
|--------|--------|
| **Mechanism** | `companyId` is extracted from the URL path parameter (`:companyId`). There is no bearer token or API key verification yet. |
| **Validation** | The `companyIdSchema` (Zod) enforces that the value is a non-empty string between 1 and 64 characters. |
| **Risk** | Any caller who knows a valid `companyId` can access that tenant's data. This is acceptable only in development / integration testing. |

### Planned: JWT Bearer Token

| Aspect | Detail |
|--------|--------|
| **Token format** | JWT (RS256 or ES256) issued by the Host Mojo auth service. |
| **Claims** | `sub` (userId), `company_id` (PMC tenant), `roles` (array), `exp`, `iat`. |
| **Verification** | Fastify `onRequest` hook will verify the signature using the auth service's public key, check expiration, and extract `company_id` into `TenantContext`. |
| **No anonymous access** | Every endpoint (except `/health` and `/version`) will require a valid JWT. Requests without a token receive `401 Unauthorized`. |
| **Token refresh** | Short-lived access tokens (15 minutes) with a separate refresh flow managed by the auth service. |

### Planned: Per-PMC API Keys for Webhooks

| Aspect | Detail |
|--------|--------|
| **Use case** | Inbound webhook endpoints that receive calls from PMS, Turno, Breezeway, and Handy. |
| **Mechanism** | Each PMC has a unique API key stored in the gateway secret store. The webhook payload includes `company_id`; the gateway looks up the expected API key and verifies the HMAC signature. |
| **Rotation** | Keys rotated on a 90-day schedule. Old keys remain valid for a 7-day overlap window. |

---

## 3. Webhook Signature Verification Plan

**Status: Planned (spec complete, implementation pending)**

All inbound webhooks pass through the Host Mojo Integration Gateway before
reaching this system. The gateway is responsible for signature verification,
but this section documents the full verification design for completeness.

### Inbound webhook sources

| Vendor | Webhook Route | Signature Header | Algorithm |
|--------|---------------|------------------|-----------|
| PMS | `/webhooks/pms/booking` | `X-PMS-Signature` | HMAC-SHA256 |
| Turno | `/webhooks/turno/status` | `X-Turno-Signature` | HMAC-SHA256 |
| Breezeway | `/webhooks/breezeway/status` | `X-Breezeway-Signature` | HMAC-SHA256 |
| Handy | `/webhooks/handy/confirmation` | `X-Handy-Signature` | HMAC-SHA256 + Bearer token |

### Verification procedure

1. Extract the raw request body (before JSON parsing) and the vendor-specific
   signature header.
2. Compute `HMAC-SHA256(shared_secret, raw_body)` using the per-vendor,
   per-tenant shared secret retrieved from the gateway secret store.
3. Compare the computed HMAC with the value in the signature header using a
   **constant-time comparison** function (`crypto.timingSafeEqual`) to prevent
   timing attacks.
4. If verification fails:
   - Return `403 Forbidden` immediately. Do not process the payload.
   - Log a structured audit event: `{ type: "webhook.signature_failed", vendor, companyId, ip }`.
   - Increment a signature-failure counter for alerting.
5. If verification succeeds:
   - Return `202 Accepted`.
   - Forward the payload to the maid system outbox for processing.

### Secret storage

- Vendor shared secrets are stored in the **gateway secret store** (not in
  environment variables, not in this system's database, not in code).
- This system (host_mojo_maid) **never holds vendor webhook secrets**. The
  gateway handles verification and forwards verified payloads.
- See `docs/GATEWAY_CHANGE_PLAN.md` Section 3 for the full specification.

---

## 4. Logging and Redaction Rules

**Status: Current (enforced in code)**

### Structured logging

- All logging uses **Pino** (Fastify's built-in structured logger).
- Output format: JSON in production, pretty-printed in development
  (via `pino-pretty`).
- ESLint rule `no-console: error` prevents accidental use of `console.log`
  in production code.

### Required fields on every log line

| Field | Source | Purpose |
|-------|--------|---------|
| `requestId` | `request-context.ts` middleware (UUID v4, or forwarded from `X-Request-Id` header) | Correlate all log lines and telemetry events for a single request |
| `companyId` | Extracted from route params by middleware | Audit trail for tenant-scoped operations |
| `route` | Fastify route URL pattern | Identify which endpoint was hit |
| `method` | HTTP method | Distinguish GET/POST/etc. |
| `statusCode` | Response status (on `api.request.end`) | Track error rates |
| `durationMs` | `reply.elapsedTime` (on `api.request.end`) | Performance monitoring |

### What we NEVER log

The following data types must **never** appear in log output, telemetry
events, error messages, or stack traces:

| Category | Examples | Rule |
|----------|----------|------|
| **Secrets** | API keys, JWT tokens, HMAC secrets, database passwords | Never log. Not even partially masked. |
| **Access codes** | Lockbox codes, door codes, gate codes, key safe combinations | Never stored in plain text. Manifests use `{{LOCKBOX_CODE}}` placeholders. |
| **PII - Contact** | Cleaner phone numbers, cleaner email addresses, guest names, guest emails | Redacted in production logs. Shown only in development with `LOG_LEVEL=debug`. |
| **PII - Financial** | Payment card numbers, bank account numbers | Never handled by this system (delegated to GHL). |
| **Passwords** | User passwords, service account passwords | Never handled by this system. |

### Manifest placeholder pattern

Cleaning manifests (`src/dal/cleaning-manifest.dal.ts`) enforce a
placeholder pattern for sensitive fields:

- Access instructions use `{{LOCKBOX_CODE}}`, `{{GATE_CODE}}`, etc.
- Emergency contacts use `{{OWNER_PHONE}}`, `{{MANAGER_PHONE}}`, etc.
- Actual values are resolved at runtime by the gateway or the cleaner-facing
  app, which retrieves them from the secret store. This system never sees
  the real values.

### Log redaction in production

When deploying to production, configure Pino's `redact` option to scrub
sensitive fields from any log line that might accidentally include them:

```typescript
// Example Pino redact configuration (to be applied in production)
{
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers.cookie',
      'phone',
      'email',
      'cleaner.phone',
      'cleaner.email',
      'accessCode',
      'lockboxCode',
    ],
    censor: '[REDACTED]',
  }
}
```

---

## 5. Secrets Strategy

**Status: Current (enforced by architecture)**

### Core principle

> This system (host_mojo_maid) **never holds vendor credentials**.
> All vendor API keys and secrets live in the Integration Gateway's
> secret store. This system communicates with vendors exclusively through
> the outbox + gateway pattern.

### Secrets inventory

| Secret | Where it lives | How this system uses it |
|--------|---------------|------------------------|
| Vendor API keys (Turno, Breezeway, Handy) | Gateway secret store | This system does NOT use them. The gateway makes vendor API calls. |
| GHL API key | Gateway secret store | This system does NOT use it. Payment requests go through the gateway. |
| PMS webhook secret | Gateway secret store | This system does NOT use it. The gateway verifies inbound webhooks. |
| Database credentials (`DATABASE_URL`) | `.env` file (gitignored) | Prisma reads this env var at startup. Never logged. |
| JWT signing key (planned) | Auth service | This system will only hold the **public key** for verification. |

### Repository safeguards

| Control | Implementation |
|---------|---------------|
| `.env` is gitignored | `.gitignore` includes `.env`, `.env.local`, `.env.*.local` |
| `.env.example` as template | Committed to the repo with placeholder values and comments. Never contains real secrets. |
| No secrets in code | No hardcoded API keys, passwords, or tokens anywhere in source files. |
| No secrets in logs | Enforced by logging rules (Section 4) and Pino redaction. |
| No secrets in test fixtures | Test data uses fake UUIDs and placeholder strings. Seed script (`prisma/seed.ts`) uses generated data only. |

---

## 6. Input Validation

**Status: Current (enforced in code)**

All user input is validated at the API boundary using **Zod** schemas before
any business logic or database access occurs. This is the first line of
defense against injection, overflow, and malformed data attacks.

### Validation rules by category

| Input Type | Schema | Constraints | Location |
|-----------|--------|-------------|----------|
| `companyId` (route param) | `companyIdSchema` | Non-empty string, 1-64 characters | `src/types/common.ts` |
| Entity IDs (`taskId`, `propertyId`, `bookingId`, `cleanerId`) | `entityIdSchema` | Non-empty string, 1-64 characters | `src/types/common.ts` |
| `dateFrom`, `dateTo` (query params) | `z.string().datetime()` | Must be valid ISO 8601 datetime strings | `src/api/cleaning-tasks.ts` |
| Date range span | `validateDateRange()` | `dateFrom < dateTo` enforced; max span of 366 days (`MAX_DATE_RANGE_DAYS`) | `src/types/common.ts` |
| `status` (query param) | `z.enum([...])` | Only valid task statuses accepted: `scheduled`, `assigned`, `in_progress`, `completed`, `canceled`, `failed` | `src/api/cleaning-tasks.ts` |
| `scope` (rollup query) | `z.enum(['global', 'company', 'property'])` | Only the three valid scope values | `src/api/cleaning-tasks.ts` |
| Incident `type` | Enum validation | Only: `NO_SHOW`, `LATE_START`, `DAMAGE`, `SUPPLIES`, `ACCESS`, `OTHER` | Service layer |
| Incident `severity` | Enum validation | Only: `low`, `med`, `high` | Service layer |
| Emergency request `reason` | String with max length | Max 500 characters | Service layer |

### Validation behavior

- **On validation failure**: The route returns `400 Bad Request` with a
  structured error body: `{ error: "invalid_params" | "invalid_query" | "invalid_date_range", message: "..." }`.
- **On success**: The validated data is used to construct a `TenantContext`
  and typed input objects. Raw `request.params` and `request.query` are
  never passed directly to the DAL.

### SQL injection prevention

- All database queries go through **Prisma ORM**, which uses parameterized
  queries internally. User input is never interpolated into raw SQL strings.
- There are **zero** raw SQL queries (`$queryRaw`, `$executeRaw`) anywhere
  in the codebase.
- Prisma's query engine escapes all parameters automatically.

---

## 7. Dependency Security

**Status: Current**

### Policy

| Control | Detail |
|---------|--------|
| **`npm audit` before each release** | Run `npm audit` and resolve all high/critical vulnerabilities before any deployment. |
| **Minimal dependency footprint** | The system uses 7 runtime dependencies and 11 dev dependencies (see `package.json`). Every dependency is justified. |
| **No native binaries** | No dependencies that compile native C/C++ addons. This avoids supply-chain risks from binary blobs and simplifies cross-platform builds. |
| **Lock file committed** | `package-lock.json` is committed to the repo and must be used for installs (`npm ci` in CI/CD). This ensures reproducible builds and prevents dependency confusion attacks. |
| **Engine constraint** | `package.json` requires `node >= 20.0.0`. |

### Runtime dependencies

| Package | Purpose |
|---------|---------|
| `fastify` | HTTP framework |
| `@fastify/sensible` | Standard error helpers |
| `@prisma/client` | Database ORM client |
| `dotenv` | Load `.env` in development |
| `fastify-plugin` | Plugin encapsulation for middleware |
| `pino` | Structured logging |
| `uuid` | UUID v4 generation for request IDs and entity IDs |
| `zod` | Input validation schemas |

---

## 8. Data Protection

**Status: Current (enforced in code and schema design)**

### Access codes and lockbox codes

- Access codes (lockbox codes, door codes, gate codes) are **never stored in
  plain text** anywhere in this system.
- The `CleaningManifest` model stores access instructions as JSON with
  **placeholder tokens**: `{{LOCKBOX_CODE}}`, `{{GATE_CODE}}`, etc.
- The `ManifestAccessInstructions` interface in `src/dal/cleaning-manifest.dal.ts`
  documents this requirement: "Must NEVER contain actual codes -- use
  placeholders."
- Actual codes are resolved at runtime by the cleaner-facing application,
  which retrieves them from a secure secret store. This system is never in
  the resolution path.

### Emergency contacts

- Emergency contact phone numbers in cleaning manifests use placeholder
  tokens: `{{OWNER_PHONE}}`, `{{MANAGER_PHONE}}`.
- The `ManifestEmergencyContact` interface uses a `phonePlaceholder` field
  (not a `phone` field), enforcing the placeholder pattern at the type level.

### Payment amounts

- All monetary values are stored as **integers in cents**
  (`payment_amount_cents: Int` in the Prisma schema). This avoids
  floating-point rounding errors that could lead to financial discrepancies.
- Currency is always USD (U.S. only system).
- This system **does not process payments**. It creates payment request
  outbox entries that the gateway forwards to GHL (GoHighLevel). Credit
  card numbers, bank accounts, and payment tokens never touch this system.

### Outbox payload safety

- Outbox payloads (`payload_json`) are JSON-serialized by the adapter layer.
- Payloads contain entity IDs and business data (task IDs, amounts in cents,
  notification text) but **never** contain secrets, access codes, or raw PII.
- The `idempotency_key` on each outbox row prevents duplicate side-effects
  during retries.

### Data retention

- The `events` table (telemetry) grows indefinitely in the current
  implementation. A retention policy (e.g., 90-day TTL for non-incident
  events) should be implemented before production deployment.
- Database backups and encryption-at-rest are the responsibility of the
  infrastructure layer (managed Postgres in production).

---

## 9. Future Work / TODO

The following items are tracked for implementation before production
deployment. They are listed in approximate priority order.

| Item | Priority | Description |
|------|----------|-------------|
| **JWT authentication** | P0 | Replace the auth stub with JWT verification on all tenant-scoped endpoints. Extract `company_id` and `user_id` from token claims. |
| **Rate limiting** | P0 | Add per-IP and per-tenant rate limits to prevent abuse. Use Fastify's `@fastify/rate-limit` plugin. Suggested defaults: 100 req/min per IP, 1000 req/min per tenant. |
| **CORS configuration** | P1 | Restrict allowed origins to the Host Mojo frontend domain(s). Deny all origins by default. Use `@fastify/cors`. |
| **Row-level security (Postgres)** | P1 | Add RLS policies on all tenant-scoped tables as a defense-in-depth layer (see Section 1). |
| **Pino log redaction (production)** | P1 | Enable the `redact` configuration described in Section 4 when deploying to production. |
| **Helmet headers** | P1 | Add `@fastify/helmet` for standard security headers (CSP, X-Frame-Options, HSTS, etc.). |
| **Secret rotation procedures** | P2 | Document and automate rotation for JWT signing keys, webhook HMAC secrets, and database credentials. Target: 90-day rotation cycle. |
| **HTTPS enforcement** | P2 | Ensure all production traffic is TLS-terminated. Redirect HTTP to HTTPS. HSTS header with `max-age=31536000`. |
| **Penetration testing checklist** | P2 | Conduct a structured pen-test covering OWASP Top 10, tenant isolation bypass attempts, and webhook replay attacks. |
| **OWASP Top 10 review** | P2 | Systematic review against OWASP 2021 Top 10. Current coverage summary below. |
| **Telemetry data retention** | P3 | Implement a 90-day TTL for non-incident telemetry events. Archive older data to cold storage. |
| **Webhook replay protection** | P3 | Add timestamp validation on inbound webhooks (reject payloads older than 5 minutes) to prevent replay attacks. |
| **Audit log immutability** | P3 | Ensure the `events` table is append-only in production (no UPDATE/DELETE permissions for the application database user). |

### OWASP Top 10 (2021) Coverage

| # | Category | Current Status |
|---|----------|----------------|
| A01 | Broken Access Control | Mitigated by `companyId` scoping in every DAL query, Zod validation at boundary, TenantContext threading. RLS planned for Postgres. |
| A02 | Cryptographic Failures | No secrets stored. Placeholders for access codes. HMAC verification planned at gateway. |
| A03 | Injection | Mitigated by Prisma parameterized queries (zero raw SQL) and Zod input validation. |
| A04 | Insecure Design | Layered architecture (Route -> Service -> DAL), outbox pattern for side-effects, deterministic scheduling logic. |
| A05 | Security Misconfiguration | `.env` gitignored, no default credentials, ESLint `no-console` rule. Helmet/CORS/rate-limit pending. |
| A06 | Vulnerable Components | Minimal dependencies, `npm audit` policy, lock file committed. |
| A07 | Auth Failures | Auth stub only (dev). JWT planned (P0). No anonymous access once JWT is implemented. |
| A08 | Data Integrity Failures | Outbox idempotency keys prevent duplicate side-effects. Webhook signature verification planned. |
| A09 | Logging Failures | Structured Pino logging with `requestId` and `companyId` on every line. Telemetry events in DB. |
| A10 | SSRF | No outbound HTTP calls from this system. All vendor communication via outbox + gateway. SSRF risk is zero in the current architecture. |

---

## Revision History

| Date | Phase | Summary |
|------|-------|---------|
| Phase 0 | 0 | Baseline rules (no secrets, structured logging, input validation, `npm audit`). |
| Phase 6 | 6 | Full security hardening document. Tenant isolation model, auth plan, webhook verification plan, logging/redaction rules, secrets strategy, input validation inventory, dependency policy, data protection rules, OWASP review. |

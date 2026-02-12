# Gateway Change Plan — Maid Triage System Integration

> **Purpose**: This document tells the Host Mojo Integration Gateway team
> exactly what to add/change so the gateway can support maid-service operations.
> No changes to the gateway repo happen in Phase 2 — this is the spec.

## 1. New Endpoints the Gateway Must Expose

### 1.1 Inbound Webhooks (external vendor → gateway → maid system)

| Route                         | Method | Source      | Purpose                              |
|-------------------------------|--------|-------------|--------------------------------------|
| `/webhooks/pms/booking`       | POST   | PMS         | Booking created/modified/canceled    |
| `/webhooks/turno/status`      | POST   | Turno       | Cleaning job status update           |
| `/webhooks/breezeway/status`  | POST   | Breezeway   | Task status update                   |
| `/webhooks/handy/confirmation`| POST   | Handy       | Emergency cleaning confirmation      |

All inbound webhooks MUST:
- Validate the `X-Webhook-Signature` header against a per-vendor secret.
- Extract and inject `company_id` from the vendor's tenant mapping.
- Return `202 Accepted` immediately, then forward the payload to the maid system outbox.
- Log every webhook to the gateway's audit trail.

### 1.2 Outbound Actions (maid system → gateway → external vendor)

| Route                          | Method | Target      | Purpose                              |
|--------------------------------|--------|-------------|--------------------------------------|
| `/actions/turno/create-job`    | POST   | Turno API   | Create a cleaning job                |
| `/actions/turno/update-job`    | PATCH  | Turno API   | Update a cleaning job                |
| `/actions/turno/cancel-job`    | POST   | Turno API   | Cancel a cleaning job                |
| `/actions/breezeway/create-task`| POST  | Breezeway   | Create a task                        |
| `/actions/breezeway/update-task`| PATCH | Breezeway   | Update a task                        |
| `/actions/handy/emergency`     | POST   | Handy API   | Emergency cleaning request           |
| `/actions/ghl/payment-request` | POST   | GHL API     | Request payment (NOT process it)     |
| `/actions/ghl/workflow-trigger` | POST  | GHL API     | Trigger a CRM workflow               |
| `/actions/notify/send`         | POST   | SMS/Email   | Send notification to cleaner/host    |

All outbound actions MUST:
- Accept an `idempotency_key` header and deduplicate.
- Include `company_id` in the body (validated at gateway level).
- Use the vendor's API credentials from the gateway secret store (never from the maid system).

## 2. Data Contract Examples

### 2.1 Inbound: PMS Booking Webhook

```json
{
  "company_id": "pmc-001",
  "event": "booking.created",
  "reservation": {
    "external_id": "res-abc-123",
    "property_external_id": "prop-xyz-789",
    "guest_name": "Jane Doe",
    "check_in": "2026-03-15",
    "check_out": "2026-03-20",
    "guest_count": 4,
    "status": "booked"
  },
  "received_at": "2026-03-10T14:30:00Z",
  "signature_header": "sha256=abc123..."
}
```

### 2.2 Outbound: Create Turno Job

```json
{
  "company_id": "pmc-001",
  "property_external_id": "prop-xyz-789",
  "task_id": "task-uuid-here",
  "scheduled_date": "2026-03-20",
  "scheduled_time": "11:00",
  "duration_minutes": 90,
  "cleaner_external_id": "cleaner-turno-456"
}
```

### 2.3 Outbound: GHL Payment Request

```json
{
  "company_id": "pmc-001",
  "task_id": "task-uuid-here",
  "cleaner_id": "cleaner-uuid",
  "amount_cents": 7500,
  "currency": "USD",
  "description": "Turnover clean - 123 Beach Rd - 2026-03-20"
}
```

### 2.4 Outbound: Notification

```json
{
  "company_id": "pmc-001",
  "recipient_id": "cleaner-uuid",
  "recipient_type": "cleaner",
  "channel": "sms",
  "body": "You have a new cleaning assigned for tomorrow at 11:00 AM.",
  "metadata": { "task_id": "task-uuid" }
}
```

## 3. Auth & Signature Verification

| Vendor    | Auth Mechanism             | Signature Header          |
|-----------|----------------------------|---------------------------|
| PMS       | HMAC-SHA256 shared secret  | `X-PMS-Signature`         |
| Turno     | HMAC-SHA256 shared secret  | `X-Turno-Signature`       |
| Breezeway | HMAC-SHA256 shared secret  | `X-Breezeway-Signature`   |
| Handy     | Bearer token + HMAC        | `X-Handy-Signature`       |
| GHL       | API key in header          | `Authorization: Bearer …` |

**Rules:**
- Every inbound webhook MUST be verified before forwarding.
- Failed signature verification → `403 Forbidden`, log the attempt.
- Vendor secrets are stored in the gateway's secret store, never in env vars or code.
- Rotate secrets on a 90-day schedule (gateway team responsibility).

## 4. Retry + Backoff Requirements

### Outbound actions (gateway → vendor)
- Max retries: **5**
- Backoff: **exponential** with jitter — `min(30s * 2^attempt, 15min) + random(0–5s)`
- After 5 failures: mark the outbox row as `failed`, raise an alert.

### Inbound webhooks (vendor → gateway)
- Return `202 Accepted` immediately.
- If internal forwarding to the maid system fails, write to a dead-letter queue.
- DLQ items are retried 3x with 1-minute intervals, then alerted.

## 5. Tenant Isolation Constraints

- The gateway MUST validate `company_id` on every request.
- Vendor credentials are per-tenant — the gateway looks up the correct API key using `company_id`.
- No request may access data from a different tenant. Cross-tenant requests → `403`.
- Gateway logs MUST include `company_id` for audit.

## 6. External ID Mapping

The gateway maintains a mapping table:

| Column            | Type   | Description                         |
|-------------------|--------|-------------------------------------|
| `company_id`      | string | Our tenant ID                       |
| `vendor`          | string | e.g. "turno", "breezeway"           |
| `internal_id`     | string | Our system's entity ID              |
| `external_id`     | string | Vendor's entity ID                  |
| `entity_type`     | string | "property", "job", "cleaner", etc.  |
| `created_at`      | datetime | Mapping creation timestamp        |

**Mapping rules:**
- When creating an outbound resource, the gateway stores the mapping.
- When receiving an inbound webhook, the gateway resolves the external ID to our internal ID.
- If no mapping is found for an inbound webhook → `404`, log, alert.

## 7. Outbox Row Types (Phase 6 — Final Inventory)

The maid system writes the following outbox row types. The gateway's outbox
processor must handle each one by calling the corresponding vendor action.

| Outbox `type` | Gateway Action Route | Created By |
|---------------|---------------------|------------|
| `notify_cleaner` | `/actions/notify/send` | dispatch.service, no-show-ladder.service |
| `notify_host` | `/actions/notify/send` | no-show.service, no-show-ladder.service, emergency.service |
| `payment_request` | `/actions/ghl/payment-request` | payment.service |
| `emergency_clean_request` | `/actions/handy/emergency` | emergency.service |
| `turno.create_job` | `/actions/turno/create-job` | stub-turno adapter |
| `turno.update_job` | `/actions/turno/update-job` | stub-turno adapter |
| `turno.cancel_job` | `/actions/turno/cancel-job` | stub-turno adapter |
| `turno.status_webhook` | (inbound, processed by maid system) | stub-turno adapter |
| `breezeway.create_task` | `/actions/breezeway/create-task` | stub-breezeway adapter |
| `handy.emergency_request` | `/actions/handy/emergency` | stub-handy adapter |
| `pms.booking_webhook` | (inbound, processed by maid system) | stub-pms adapter |

## 8. Integration Readiness Checklist (Phase 6)

Before the gateway team begins implementation, verify:

- [ ] All JSON schemas in `docs/CONTRACTS/schemas/` are reviewed and agreed upon
- [ ] Signature header names match the vendor's documentation
- [ ] Per-tenant credential storage is provisioned in the gateway secret store
- [ ] Dead-letter queue is set up for failed inbound webhook forwarding
- [ ] Idempotency key deduplication window is configured (recommended: 24 hours)
- [ ] Monitoring alerts are configured for: signature failures, outbox processing failures, DLQ depth
- [ ] External ID mapping table is created with indexes on `(company_id, vendor, external_id)`
- [ ] Gateway can route both by outbox `type` string and by explicit action endpoint

## 9. Revision History

| Date | Phase | Change |
|------|-------|--------|
| Phase 2 | 2 | Initial gateway change plan: endpoints, contracts, auth, retry, tenant isolation, ID mapping. |
| Phase 6 | 6 | Final pass: added outbox type inventory (Section 7), integration readiness checklist (Section 8). All adapter interfaces frozen. |

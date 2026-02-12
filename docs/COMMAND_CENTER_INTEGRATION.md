# Command Center Integration Guide

How to integrate the Host Mojo Command Center dashboard with the Maid Triage System API.

**Base URL (dev):** `http://localhost:3000`
**Base URL (prod):** TBD

All cleaning endpoints are prefixed with `/companies/:companyId/`. The `companyId` path
parameter identifies the Property Management Company (PMC) tenant. Every request is scoped
to that tenant -- you will never see data from another PMC.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Error Handling](#2-error-handling)
3. [Date Range Limits](#3-date-range-limits)
4. [Endpoints and Example Payloads](#4-endpoints-and-example-payloads)
   - 4.1 [List Cleaning Tasks](#41-list-cleaning-tasks)
   - 4.2 [Get Cleaning Rollup](#42-get-cleaning-rollup)
   - 4.3 [Cleaner Accept](#43-cleaner-accept)
   - 4.4 [Cleaner Check-In](#44-cleaner-check-in)
   - 4.5 [Complete Task](#45-complete-task)
   - 4.6 [Get Cleaning Manifest](#46-get-cleaning-manifest)
   - 4.7 [Emergency Cleaning Request](#47-emergency-cleaning-request)
   - 4.8 [Telemetry Dashboard](#48-telemetry-dashboard)
5. [Polling Cadence Recommendations](#5-polling-cadence-recommendations)
6. [Rollups Spec](#6-rollups-spec)
7. [UX States](#7-ux-states)

---

## 1. Authentication

**Current implementation:** The PMC is identified by the `companyId` path parameter. There
is no bearer token or session cookie required today.

**Planned:** JWT bearer token in the `Authorization` header. When this ships, every request
must include:

```
Authorization: Bearer <jwt_token>
```

The JWT will contain `companyId`, `userId`, and `roles`. The path `companyId` must match
the token's `companyId` claim or the request will be rejected with `403 Forbidden`.

Until JWT auth lands, the Command Center should still pass `companyId` in the path exactly
as shown below. No other auth headers are required.

---

## 2. Error Handling

Every error response follows the same shape:

```json
{
  "error": "error_code",
  "message": "Human-readable detail (optional)"
}
```

| HTTP Status | Meaning | Common `error` codes |
|---|---|---|
| 400 | Bad request -- invalid params, query, or body | `invalid_params`, `invalid_query`, `invalid_body`, `invalid_date_range` |
| 403 | Forbidden (planned -- JWT mismatch) | `forbidden` |
| 404 | Resource not found | `not_found` |
| 409 | State conflict (e.g. wrong task status) | `accept_failed`, `checkin_failed`, `complete_failed` |
| 500 | Internal server error | `emergency_request_failed`, `internal_error` |

**Dashboard guidance:** Display the `message` field to the operator when present. Fall back
to a generic message based on the `error` code when `message` is absent.

---

## 3. Date Range Limits

All endpoints that accept `dateFrom` and `dateTo` enforce these rules:

- Both values must be ISO 8601 datetime strings (e.g. `2025-06-01T00:00:00Z`).
- `dateFrom` must be strictly before `dateTo`.
- The span must not exceed **366 days**. Requests with a wider range receive a `400` with
  `error: "invalid_date_range"`.

---

## 4. Endpoints and Example Payloads

### 4.1 List Cleaning Tasks

Retrieve a filtered, time-ordered list of cleaning tasks for one PMC.

```
GET /companies/:companyId/cleaning/tasks
```

**Query parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `dateFrom` | ISO 8601 datetime | No | Start of the window (inclusive). |
| `dateTo` | ISO 8601 datetime | No | End of the window (inclusive). |
| `propertyId` | string | No | Filter to a single property. |
| `status` | enum | No | One of: `scheduled`, `assigned`, `in_progress`, `completed`, `canceled`, `failed`. |

When both `dateFrom` and `dateTo` are provided, the [date range limits](#3-date-range-limits)
apply.

**Example request:**

```
GET /companies/pmc-acme-001/cleaning/tasks?dateFrom=2025-06-01T00:00:00Z&dateTo=2025-06-02T00:00:00Z&status=assigned
```

**Example response (200):**

```json
{
  "tasks": [
    {
      "id": "ct-abc-123",
      "companyId": "pmc-acme-001",
      "propertyId": "prop-lake-house",
      "bookingId": "bk-9087",
      "scheduledStartAt": "2025-06-01T11:00:00.000Z",
      "scheduledEndAt": "2025-06-01T12:30:00.000Z",
      "status": "assigned",
      "assignedCleanerId": "clnr-maria-01",
      "vendor": "turno",
      "vendorTaskId": "turno-ext-44812",
      "paymentAmountCents": 12500,
      "paymentStatus": "none",
      "confirmedAt": null,
      "completedAt": null,
      "createdAt": "2025-05-28T09:15:00.000Z",
      "updatedAt": "2025-05-30T14:22:00.000Z",
      "assignedCleaner": {
        "id": "clnr-maria-01",
        "name": "Maria Garcia",
        "phone": "+15551234567",
        "email": "maria@example.com",
        "status": "active",
        "reliabilityScore": 95
      },
      "property": {
        "id": "prop-lake-house",
        "name": "Lake House Retreat",
        "addressCity": "Bar Harbor",
        "addressState": "ME",
        "timezone": "America/New_York",
        "bedrooms": 3,
        "bathrooms": 2,
        "standardCheckinTime": "16:00",
        "standardCheckoutTime": "11:00",
        "cleaningDurationMinutes": 90
      }
    }
  ]
}
```

**Notes:**
- `assignedCleaner` is `null` when no cleaner has been assigned yet (status = `scheduled`).
- `property` is always included.
- Results are ordered by `scheduledStartAt` ascending.

---

### 4.2 Get Cleaning Rollup

Aggregate statistics for a date range. Used to power the dashboard summary cards.

```
GET /companies/:companyId/cleaning/rollup
```

**Query parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `dateFrom` | ISO 8601 datetime | **Yes** | Start of the window. |
| `dateTo` | ISO 8601 datetime | **Yes** | End of the window. |
| `scope` | enum | No | `global`, `company` (default), or `property`. See [Rollups Spec](#6-rollups-spec). |
| `propertyId` | string | Conditional | Required when `scope=property`. |

**Example request:**

```
GET /companies/pmc-acme-001/cleaning/rollup?dateFrom=2025-06-01T00:00:00Z&dateTo=2025-06-08T00:00:00Z&scope=company
```

**Example response (200):**

```json
{
  "rollup": {
    "tasksTotal": 42,
    "tasksCompleted": 38,
    "onTimeRate": 0.89,
    "noShowCount": 1,
    "avgCleanDurationMinutes": 82,
    "paymentTotalCents": 475000
  }
}
```

**Field definitions:**

| Field | Type | Description |
|---|---|---|
| `tasksTotal` | integer | Total cleaning tasks in the date range. |
| `tasksCompleted` | integer | Tasks with status `completed`. |
| `onTimeRate` | number (0-1) | Fraction of completed tasks finished by `scheduledEndAt`. `0` when no tasks are completed. |
| `noShowCount` | integer | Number of `NO_SHOW` incidents tied to tasks in the range. |
| `avgCleanDurationMinutes` | integer or null | Average minutes from scheduled start to completion. `null` when no tasks are completed. |
| `paymentTotalCents` | integer | Sum of `paymentAmountCents` for tasks with `paymentStatus = "paid"`. |

---

### 4.3 Cleaner Accept

Called when a cleaner confirms they will handle an assigned task. Transitions the task from
`assigned` to `assigned` with a `confirmedAt` timestamp.

```
POST /companies/:companyId/cleaning/tasks/:taskId/cleaner-accept
```

**Request body:** None required.

**Example request:**

```
POST /companies/pmc-acme-001/cleaning/tasks/ct-abc-123/cleaner-accept
```

**Example response (200):**

```json
{
  "ok": true
}
```

**Error response (409) -- wrong task state:**

```json
{
  "error": "accept_failed",
  "message": "Task is not in a state that allows acceptance"
}
```

---

### 4.4 Cleaner Check-In

Called when a cleaner arrives on-site. Transitions the task from `assigned` to `in_progress`.

```
POST /companies/:companyId/cleaning/tasks/:taskId/check-in
```

**Request body:** None required.

**Example request:**

```
POST /companies/pmc-acme-001/cleaning/tasks/ct-abc-123/check-in
```

**Example response (200):**

```json
{
  "ok": true
}
```

**Error response (409):**

```json
{
  "error": "checkin_failed",
  "message": "Task is not in a state that allows check-in"
}
```

---

### 4.5 Complete Task

Called when the cleaner finishes. Transitions the task to `completed` and triggers a payment
request through the outbox.

```
POST /companies/:companyId/cleaning/tasks/:taskId/complete
```

**Request body:** None required.

**Example request:**

```
POST /companies/pmc-acme-001/cleaning/tasks/ct-abc-123/complete
```

**Example response (200):**

```json
{
  "ok": true,
  "paymentRequested": true
}
```

**Field notes:**
- `paymentRequested` is `true` when the payment outbox row was created successfully.
- `paymentRequested` is `false` when the payment request failed. The task is still marked
  `completed` -- payment failure is non-fatal and will be retried by the outbox processor.

**Error response (409):**

```json
{
  "error": "complete_failed",
  "message": "Task is not in a state that allows completion"
}
```

---

### 4.6 Get Cleaning Manifest

Retrieve the cleaning checklist, supply locations, access instructions, and emergency
contacts for a property. Returns a default manifest if none has been configured yet.

```
GET /companies/:companyId/properties/:propertyId/cleaning-manifest
```

**Example request:**

```
GET /companies/pmc-acme-001/properties/prop-lake-house/cleaning-manifest
```

**Example response (200):**

```json
{
  "manifest": {
    "propertyId": "prop-lake-house",
    "checklist": {
      "items": [
        "Strip and remake all beds with fresh linens",
        "Clean all bathrooms (toilets, sinks, showers, mirrors)",
        "Vacuum and mop all floors",
        "Wipe down kitchen counters and appliances",
        "Empty all trash cans and replace liners",
        "Check and restock toiletries (soap, shampoo, toilet paper)",
        "Dust all surfaces and furniture",
        "Clean inside microwave and oven",
        "Wipe light switches and door handles",
        "Set thermostat to guest-ready temperature",
        "Lock all doors and windows when leaving"
      ]
    },
    "supplyLocations": {
      "locations": [
        "Hallway closet, 2nd floor",
        "Garage shelving unit, left wall"
      ]
    },
    "accessInstructions": {
      "instructions": "Use lockbox code {{LOCKBOX_CODE}} at the front door. If electronic lock, use code {{ELECTRONIC_LOCK_CODE}}."
    },
    "emergencyContacts": {
      "contacts": [
        {
          "name": "Jane Smith",
          "role": "owner",
          "phonePlaceholder": "{{OWNER_PHONE}}"
        },
        {
          "name": "Mike Johnson",
          "role": "property_manager",
          "phonePlaceholder": "{{PM_PHONE}}"
        }
      ]
    },
    "updatedAt": "2025-05-15T10:30:00.000Z"
  }
}
```

**Notes:**
- `accessInstructions` and `emergencyContacts` use placeholder tokens (e.g.
  `{{LOCKBOX_CODE}}`, `{{OWNER_PHONE}}`). Actual secrets are resolved at runtime by the
  secret store and are never stored in the manifest or returned by this API.
- If no manifest has been set up for the property, a default manifest with generic
  checklist items and placeholder tokens is returned.

---

### 4.7 Emergency Cleaning Request

Trigger an emergency cleaning dispatch. Creates a high-severity incident, writes an outbox
row for the vendor marketplace (Handy/Turno), and notifies the host.

```
POST /companies/:companyId/cleaning/emergency-request
```

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `propertyId` | string | **Yes** | The property that needs emergency cleaning. |
| `neededBy` | ISO 8601 datetime | **Yes** | Deadline for the cleaning to start. |
| `reason` | string (1-500 chars) | **Yes** | Why the emergency clean is needed. |

**Example request:**

```
POST /companies/pmc-acme-001/cleaning/emergency-request
Content-Type: application/json

{
  "propertyId": "prop-lake-house",
  "neededBy": "2025-06-01T14:00:00Z",
  "reason": "Cleaner no-show with guest arriving at 4 PM"
}
```

**Example response (201):**

```json
{
  "ok": true,
  "incidentId": "inc-def-456",
  "outboxId": "obx-ghi-789"
}
```

**Field notes:**
- `incidentId` -- the ID of the high-severity incident created for tracking.
- `outboxId` -- the ID of the outbox row that will be processed to dispatch a vendor.

**Error response (500):**

```json
{
  "error": "emergency_request_failed",
  "message": "Failed to create incident record"
}
```

---

### 4.8 Telemetry Dashboard

A server-rendered HTML page showing system health at a glance. Not a JSON API -- open it
in an iframe or a new browser tab.

```
GET /telemetry
```

**Returns:** `text/html`

**What it shows:**
- p50 and p95 API latency (milliseconds).
- Incident counts by type (last 30 days).
- Last 100 telemetry events with timestamps, types, and payloads.

This endpoint is **not** scoped to a company. It shows global system health and is intended
for internal ops use only. Restrict access when deploying to production.

---

## 5. Polling Cadence Recommendations

The Command Center dashboard should poll the Maid Triage API at the following intervals.
These balance real-time visibility with server load.

| Endpoint | Recommended interval | Rationale |
|---|---|---|
| `GET .../cleaning/tasks` | **Every 30 seconds** | Task status changes frequently during turnover windows. Cleaners accept, check in, and complete on short timescales. 30s keeps the board current without hammering the server. |
| `GET .../cleaning/rollup` | **Every 5 minutes** | Rollup aggregates change slowly (tasks complete over hours). 5-minute refresh is sufficient for summary cards. |
| `GET /telemetry` | **Every 1 minute** | Latency and incident data is useful for ops monitoring but does not need sub-minute resolution. |

**Implementation tips:**
- Use the task list poll as the primary heartbeat. If it returns a network error, show a
  "connection lost" banner and retry with exponential backoff (max 60s).
- Pause polling when the browser tab is not visible (`document.hidden === true`) to save
  bandwidth and server resources. Resume immediately when the tab regains focus.
- When the operator drills into a single property, add `propertyId` to the task list query
  to reduce payload size.

---

## 6. Rollups Spec

The rollup endpoint supports three scopes, controlled by the `scope` query parameter.

### 6.1 Global (`scope=global`)

Aggregates across **all PMCs**. Intended for the Host Mojo admin/ops view, not for
individual PMC dashboards.

```
GET /companies/pmc-acme-001/cleaning/rollup?scope=global&dateFrom=...&dateTo=...
```

Even though a `companyId` is in the path (required by the URL structure), the rollup
ignores it when `scope=global` and aggregates across all companies.

> **Access control note:** When JWT auth is added, only users with an `admin` role will be
> permitted to use `scope=global`. PMC operators will receive a `403` if they try.

### 6.2 Company (`scope=company`) -- default

Aggregates all properties for the PMC identified by `:companyId`. This is the default
scope and the one used on the main PMC dashboard.

```
GET /companies/pmc-acme-001/cleaning/rollup?scope=company&dateFrom=...&dateTo=...
```

### 6.3 Property (`scope=property`)

Drills down to a single property. `propertyId` is **required** when this scope is used.

```
GET /companies/pmc-acme-001/cleaning/rollup?scope=property&propertyId=prop-lake-house&dateFrom=...&dateTo=...
```

If `propertyId` is omitted with `scope=property`, the server returns:

```json
{
  "error": "invalid_query",
  "message": "propertyId is required when scope is 'property'"
}
```

---

## 7. UX States

The Command Center dashboard should map each cleaning task to one of five visual states.
The first four come directly from the `status` field. The fifth ("At Risk") is a
**client-side derivation** based on status + timing.

| Display state | Color | Condition |
|---|---|---|
| **Scheduled** | Gray | `status === "scheduled"` -- task created, no cleaner assigned yet. |
| **Assigned** | Blue | `status === "assigned"` AND the task is not at risk (see below). |
| **In Progress** | Yellow | `status === "in_progress"` -- cleaner is on-site, cleaning. |
| **Completed** | Green | `status === "completed"` -- cleaning finished. |
| **At Risk** | Red | Any of these conditions: |
| | | -- `status === "assigned"` AND `confirmedAt` is `null` AND `scheduledStartAt` is in the past (cleaner was assigned but never confirmed). |
| | | -- `status === "failed"` (task failed outright). |
| | | -- `status === "assigned"` AND `confirmedAt` is `null` AND `scheduledStartAt` is within 30 minutes from now (confirmation deadline approaching). |

### At Risk logic (pseudocode)

```ts
function getDisplayState(task: CleaningTask): string {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'in_progress') return 'in_progress';
  if (task.status === 'scheduled') return 'scheduled';
  if (task.status === 'canceled') return 'completed'; // gray out or hide
  if (task.status === 'failed') return 'at_risk';

  // status === 'assigned'
  if (task.confirmedAt !== null) return 'assigned';

  const now = new Date();
  const start = new Date(task.scheduledStartAt);
  const thirtyMinFromNow = new Date(now.getTime() + 30 * 60_000);

  // Past the start time with no confirmation = definite risk
  if (start <= now) return 'at_risk';

  // Within 30 minutes of start with no confirmation = approaching risk
  if (start <= thirtyMinFromNow) return 'at_risk';

  return 'assigned';
}
```

### State flow diagram

```
  Scheduled (gray)
      |
      v
  Assigned (blue) -----> At Risk (red)
      |                     |
      v                     v
  In Progress (yellow)   [operator intervenes / emergency request]
      |
      v
  Completed (green)
```

The dashboard should re-evaluate the "At Risk" condition on every poll cycle (every 30
seconds) since it depends on the current time.

---

## Appendix: Task Status State Machine (server-side)

These are the valid status transitions enforced by the API. The dashboard does not need to
enforce these, but understanding them helps when handling `409` errors.

```
scheduled  -->  assigned    (cleaner assigned by dispatch)
scheduled  -->  canceled    (booking canceled)
assigned   -->  in_progress (cleaner checks in)
assigned   -->  canceled    (booking canceled)
assigned   -->  failed      (no-show detected)
assigned   -->  scheduled   (un-assign for re-dispatch)
in_progress --> completed   (cleaner finishes)
in_progress --> failed      (cleaner abandons)
```

Terminal states (`completed`, `canceled`, `failed`) allow no further transitions.

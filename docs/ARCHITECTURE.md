# Architecture

## Layered Architecture

```
HTTP Request
    |
    v
Fastify Route (thin: validate input, call service, send response)
    |
    v
Service Layer (business logic, orchestration)
    |
    v
DAL — Data Access Layer (Prisma queries, always tenant-scoped)
    |
    v
Prisma ORM -> SQLite (dev) / PostgreSQL (prod)
```

## Key Principles

1. **Routes never touch the database directly.** They call services.
2. **Services never import Prisma directly.** They call the DAL.
3. **External vendors are accessed through adapter interfaces** under `src/integrations/`.
4. **All outbound side-effects go through an outbox table** for safe retry.
5. **Multi-tenant isolation**: every query is scoped to `company_id`.

## Data Model (Phase 1)

```mermaid
erDiagram
    Company ||--o{ Property : "has"
    Company ||--o{ Cleaner : "employs"
    Company ||--o{ Booking : "manages"
    Company ||--o{ CleaningTask : "schedules"
    Company ||--o{ Incident : "tracks"
    Company ||--o{ Outbox : "queues"

    Property ||--o{ Booking : "hosts"
    Property ||--o{ CleaningTask : "requires"
    Property ||--o{ CleanerProperty : "assigned"
    Property ||--o{ Incident : "reported at"
    Property }o--o| Cleaner : "default cleaner"

    Cleaner ||--o{ CleanerProperty : "services"
    Cleaner ||--o{ CleaningTask : "assigned to"

    CleanerProperty {
        string cleaner_id PK
        string property_id PK
        int priority
    }

    Booking ||--o{ CleaningTask : "triggers"

    CleaningTask ||--o{ Incident : "reported on"

    Company {
        string id PK
        string name
        string market_region
        datetime created_at
    }

    Property {
        string id PK
        string company_id FK
        string name
        string address_city
        string address_state
        string timezone
        int bedrooms
        int bathrooms
        string standard_checkin_time
        string standard_checkout_time
        int cleaning_duration_minutes
        string default_cleaner_id FK
    }

    Cleaner {
        string id PK
        string company_id FK
        string name
        string phone
        string email
        string status
        int reliability_score
    }

    Booking {
        string id PK
        string company_id FK
        string property_id FK
        datetime start_at
        datetime end_at
        string status
        string source
    }

    CleaningTask {
        string id PK
        string company_id FK
        string property_id FK
        string booking_id FK
        datetime scheduled_start_at
        datetime scheduled_end_at
        string status
        string assigned_cleaner_id FK
        string vendor
        string vendor_task_id
        int payment_amount_cents
        string payment_status
        datetime completed_at
    }

    Incident {
        string id PK
        string company_id FK
        string property_id FK
        string task_id FK
        string type
        string severity
        string description
    }

    Outbox {
        string id PK
        string company_id FK
        string type
        string payload_json
        string idempotency_key UK
        string status
        int attempts
        datetime next_attempt_at
    }

    Event {
        string id PK
        string company_id
        string type
        string payload_json
        string request_id
        string span
        int duration_ms
        string entity_type
        string entity_id
    }
```

### Table Summary

| Table | Purpose | Tenant-scoped |
|-------|---------|:---:|
| `companies` | PMC tenant boundary | (root) |
| `properties` | Rental units per PMC | Yes |
| `cleaners` | Cleaning staff per PMC | Yes |
| `cleaner_properties` | Many-to-many cleaner-property mapping with priority | Yes |
| `bookings` | Guest reservations | Yes |
| `cleaning_tasks` | Scheduled/completed cleaning jobs | Yes |
| `incidents` | Issues reported on tasks (NO_SHOW, DAMAGE, etc.) | Yes |
| `outbox` | Transactional outbox for async side-effects | Yes |
| `events` | Telemetry / audit log | Optional |

### Cleaning Task Status Flow (Phase 3)

```mermaid
stateDiagram-v2
    [*] --> scheduled : booking.created
    scheduled --> assigned : dispatch (assign cleaner)
    scheduled --> canceled : booking.canceled

    assigned --> in_progress : cleaner checks in
    assigned --> canceled : booking.canceled
    assigned --> failed : system failure
    assigned --> scheduled : no-show (unassign for backup)

    in_progress --> completed : cleaner completes
    in_progress --> failed : system failure

    completed --> [*]
    canceled --> [*]
    failed --> [*]

    note right of assigned
        Cleaner must confirm within
        CONFIRM_TIMEOUT_MINUTES (30 min).
        If not confirmed, no-show triggers.
    end note

    note right of completed
        On completion:
        1. Set completedAt
        2. Create payment request (outbox)
        3. Log telemetry event
    end note
```

### Task Lifecycle Workflow (Phase 3)

```mermaid
sequenceDiagram
    participant PMS as PMS / Booking Source
    participant BH as BookingHandler
    participant DS as DispatchService
    participant CL as Cleaner
    participant NS as NoShowChecker
    participant PS as PaymentService
    participant OB as Outbox

    PMS->>BH: booking.created
    BH->>BH: Create CleaningTask (scheduled)
    BH->>DS: dispatchTask()
    DS->>DS: Find primary cleaner (priority=1)
    DS->>DS: Assign cleaner (status=assigned)
    DS->>OB: Queue notify_cleaner

    alt Cleaner confirms in time
        CL->>DS: cleaner-accept
        DS->>DS: Set confirmedAt
        CL->>DS: check-in
        DS->>DS: Status -> in_progress
        CL->>DS: complete
        DS->>DS: Status -> completed, set completedAt
        DS->>PS: requestPayment()
        PS->>OB: Queue payment_request
    else Cleaner does not confirm
        NS->>NS: findUnconfirmedPastDeadline()
        NS->>NS: Create NO_SHOW incident (severity=med)
        NS->>DS: unassign + find backup (priority=2)
        alt Backup exists
            DS->>DS: Assign backup cleaner
            DS->>OB: Queue notify_cleaner (backup)
            DS->>OB: Queue notify_host (backup assigned)
        else No backup
            NS->>NS: Create OTHER incident (severity=high)
            NS->>OB: Queue notify_host (manual needed)
        end
    end

    PMS->>BH: booking.canceled
    BH->>BH: Cancel linked CleaningTask
```

### API Endpoints (Phase 3)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/companies/:companyId/cleaning/tasks` | List tasks (filter by date, property, status) |
| GET | `/companies/:companyId/cleaning/rollup` | Cleaning metrics rollup |
| POST | `/companies/:companyId/cleaning/tasks/:taskId/cleaner-accept` | Cleaner confirms assignment |
| POST | `/companies/:companyId/cleaning/tasks/:taskId/check-in` | Cleaner starts cleaning |
| POST | `/companies/:companyId/cleaning/tasks/:taskId/complete` | Cleaner finishes (triggers payment) |

### Configuration (Phase 3)

| Config Key | Default | Description |
|-----------|---------|-------------|
| `CONFIRM_TIMEOUT_MINUTES` | 30 | Minutes before unconfirmed assignment triggers no-show |
| `NO_SHOW_GRACE_MINUTES` | 15 | Extra grace after scheduled start (reserved for future use) |
| `ON_TIME_DEFINITION` | `scheduledEndAt` | Task is "on time" if completedAt <= this field |

### Incident Types

- `NO_SHOW` — Cleaner didn't confirm or arrive
- `LATE_START` — Cleaning started after scheduled time
- `DAMAGE` — Property damage discovered
- `SUPPLIES` — Supply issues (low stock, missing items)
- `ACCESS` — Access problems (lockbox, key)
- `OTHER` — Anything else (includes "manual intervention needed")

## Component Diagram (Phase 5)

```mermaid
graph TB
    subgraph "HTTP Layer"
        MW["Request Context Middleware<br/>(request_id, company_id, telemetry)"]
        H["Fastify Routes<br/>/health, /version, /cleaning/*, /telemetry"]
    end

    subgraph "Service Layer"
        BH["BookingHandler"]
        DS["DispatchService"]
        NS["NoShowService"]
        NL["NoShowLadder"]
        PS["PaymentService"]
        ES["EmergencyService"]
        CM["CleaningManifest"]
        TS["TelemetryService"]
        TA["TelemetryAggregation"]
    end

    subgraph "Data Access Layer"
        CTD["CleaningTaskDal"]
        ED["EventsDal"]
        ID["IncidentDal"]
        OD["OutboxDal"]
        RD["CleaningRollupDal"]
        MD["CleaningManifestDal"]
    end

    subgraph "Integration Adapters"
        PMS["StubPmsAdapter"]
        TRN["StubTurnoAdapter"]
        BRZ["StubBreezewayAdapter"]
        HDY["StubHandyAdapter"]
        GHL["StubGhlAdapter"]
        NTF["StubNotificationAdapter"]
    end

    subgraph "Database"
        DB[(SQLite / PostgreSQL)]
    end

    subgraph "Outbox Worker (future)"
        OW["Outbox Processor"]
    end

    MW --> H
    H --> BH & DS & PS & ES & CM & TS & TA & RD
    BH --> CTD & ED
    DS --> CTD & OD & ED
    NS --> CTD & ID & OD & ED
    NL --> CTD & ID & OD & ED & DS & ES
    PS --> CTD & OD & ED
    ES --> CTD & ID & OD & ED
    CM --> MD
    TS --> ED
    TA --> ED

    CTD & ED & ID & OD & RD & MD --> DB

    OW -.-> OD
    OW -.-> PMS & TRN & BRZ & HDY & GHL & NTF
```

## Sequence Diagram: Booking to Payment (Happy Path)

```mermaid
sequenceDiagram
    participant MW as Middleware
    participant BH as BookingHandler
    participant TD as CleaningTaskDal
    participant DS as DispatchService
    participant OB as OutboxDal
    participant CL as Cleaner
    participant PS as PaymentService
    participant EV as EventsDal

    Note over MW: api.request.start (request_id)

    MW->>BH: booking.created webhook
    BH->>TD: create(task)
    BH->>EV: task.created
    BH->>DS: dispatchTask()
    DS->>TD: findCleanerForProperty(priority=1)
    DS->>TD: assignCleaner()
    DS->>OB: create(notify_cleaner)
    DS->>EV: task.assigned
    DS->>EV: service.span(dispatchTask, durationMs)

    CL->>DS: cleaner-accept
    DS->>TD: confirmAssignment()
    DS->>EV: task.confirmed
    DS->>EV: service.span(acceptTask, durationMs)

    CL->>DS: check-in
    DS->>TD: transition(in_progress)
    DS->>EV: task.checked_in
    DS->>EV: service.span(checkInTask, durationMs)

    CL->>DS: complete
    DS->>TD: transition(completed)
    DS->>EV: task.completed
    DS->>EV: service.span(completeTask, durationMs)

    DS->>PS: requestPayment()
    PS->>TD: updatePaymentStatus(requested)
    PS->>OB: create(payment_request)
    PS->>EV: payment.requested

    Note over MW: api.request.end (durationMs, statusCode)
```

## Sequence Diagram: No-Show to Emergency Escalation

```mermaid
sequenceDiagram
    participant CRON as Scheduler (cron)
    participant NL as NoShowLadder
    participant TD as CleaningTaskDal
    participant ID as IncidentDal
    participant OB as OutboxDal
    participant DS as DispatchService
    participant ES as EmergencyService
    participant EV as EventsDal

    CRON->>NL: runNoShowLadder()
    NL->>TD: findMany(assigned, confirmedAt=null, past start)

    Note over NL: T+10: Remind primary
    NL->>OB: create(notify_cleaner, action=reminder)
    NL->>EV: ladder.remind_primary

    Note over NL: T+20: Switch to backup
    NL->>ID: create(NO_SHOW, severity=med)
    NL->>TD: unassign(primary)
    NL->>DS: dispatchToBackup(backupCleanerId)
    DS->>TD: assignCleaner(backup)
    DS->>OB: create(notify_cleaner, backup_assignment)
    DS->>EV: task.backup_assigned
    NL->>OB: create(notify_host, backup_assigned)
    NL->>EV: ladder.switch_backup

    Note over NL: T+40: Emergency request
    NL->>ES: requestEmergencyCleaning()
    ES->>ID: create(OTHER, severity=high)
    ES->>OB: create(emergency_clean_request)
    ES->>OB: create(notify_host)
    ES->>EV: emergency.clean_requested
    NL->>EV: ladder.emergency_request

    Note over NL: T+60: Host manual intervention
    NL->>ID: create(OTHER, severity=high)
    NL->>OB: create(notify_host, manual_intervention)
    NL->>EV: ladder.host_manual
```

## Telemetry Events (Phase 5)

All events written to the `events` table with structured fields:

| Event Type | When | Key Fields |
|-----------|------|------------|
| `api.request.start` | Request begins | request_id, route, method |
| `api.request.end` | Response sent | request_id, route, statusCode, durationMs |
| `service.span` | Service method completes | span (method name), durationMs, request_id |
| `task.created` | Booking handler creates task | entityType=cleaning_task, entityId |
| `task.assigned` | Primary cleaner dispatched | entityType=cleaning_task, cleanerId |
| `task.backup_assigned` | Backup cleaner dispatched | entityType=cleaning_task, cleanerId |
| `task.confirmed` | Cleaner accepts | entityType=cleaning_task |
| `task.checked_in` | Cleaner starts cleaning | entityType=cleaning_task |
| `task.completed` | Cleaning finished | entityType=cleaning_task, completedAt |
| `task.canceled` | Booking canceled | entityType=cleaning_task, reason |
| `task.rescheduled` | Booking extended | entityType=cleaning_task, oldStartAt, newStartAt |
| `payment.requested` | Payment queued | entityType=cleaning_task |
| `ladder.remind_primary` | T+10 reminder sent | entityType=cleaning_task |
| `ladder.switch_backup` | T+20 backup assigned | entityType=cleaning_task |
| `ladder.emergency_request` | T+40 emergency fired | entityType=cleaning_task |
| `ladder.host_manual` | T+60 manual alert | entityType=cleaning_task |
| `emergency.clean_requested` | Emergency clean created | entityType=cleaning_task |

## TODO (Phase 6+)

- [ ] Add JWT auth middleware (extract company_id from token)
- [ ] Add outbox processor worker (poll + deliver side-effects)
- [ ] Rate limiting and CORS middleware
- [ ] Real vendor adapter implementations (Turno, Breezeway, Handy)
- [ ] Stripe Connect payment processing
- [ ] WebSocket real-time dashboard events
- [ ] OpenTelemetry exporter for production APM
- [ ] Postgres Row-Level Security for multi-tenant isolation

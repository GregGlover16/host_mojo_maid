# Runbook: Cleaner No-Show

## What happened

A scheduled cleaner did not confirm their assignment or check in by the
expected time. The system detected the no-show and began its automated
escalation ladder.

## System actions (automated)

The no-show ladder runs on a timer after the task's `scheduledStartAt`:

| Time      | Action                                              |
|-----------|-----------------------------------------------------|
| T+10 min  | Send reminder notification to the primary cleaner   |
| T+20 min  | Unassign primary; dispatch to backup cleaner        |
| T+40 min  | Fire emergency marketplace request (Handy / Turno)  |
| T+60 min  | Create high-severity incident; notify host           |

At each step the system:
- Creates an `Event` row (`ladder.remind_primary`, `ladder.switch_backup`,
  `ladder.emergency_request`, `ladder.host_manual`)
- Writes notification outbox rows so the cleaner and/or host are informed
- Creates `Incident` records for severity tracking

## What the host should do

If you received a **"manual intervention needed"** notification:

1. **Check the property dashboard** — confirm the task is still unresolved.
2. **Call the property's emergency contact list** (see cleaning manifest).
3. **Try to find a local cleaner** via your network or a marketplace app.
4. **If guests are arriving soon (< 2 hours):**
   - Contact the guest to negotiate a late check-in or partial refund.
   - Consider hiring on-demand cleaning via Handy (the system may have
     already submitted a request — check the outbox).
5. **Once cleaning is arranged**, update the task status via the API or
   notify the support team so they can close the incident.

## What the support team should do (future)

1. Monitor the `/telemetry` dashboard for high-severity incidents.
2. Triage unresolved no-shows within 15 minutes of the `host_manual` event.
3. Contact the host proactively if no response within 30 minutes.
4. Document resolution in the incident record for reporting.

## Prevention

- Review cleaner reliability scores monthly; deactivate cleaners below 70.
- Ensure every property has both a primary and backup cleaner assigned.
- Consider requiring cleaners to confirm 24 hours before the scheduled start.

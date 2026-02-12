# Runbook: Emergency Cleaning Request

## What happened

An emergency cleaning was requested for a property outside the normal
turnover schedule. This usually means:
- A guest reported a cleanliness issue during their stay.
- A same-day booking requires immediate turnover.
- A no-show escalation exhausted all automated options.

## System actions (automated)

When `POST /companies/:companyId/cleaning/emergency-request` is called:

1. **Incident created** — type `OTHER`, severity `high`, with the reason text.
2. **Outbox row: `emergency_clean_request`** — queued for marketplace dispatch
   (Handy or Turno). The outbox processor will pick this up and call the
   vendor adapter.
3. **Outbox row: `notify_host`** — host is notified that an emergency request
   was submitted.
4. **Telemetry event: `emergency.clean_requested`** — logged for observability.

If no existing active task was found for the property, the system creates a
new `CleaningTask` with `vendor: 'handy'` and a 2-hour cleaning window.

## What the host should do

1. **Check your notifications** — the system sent you an alert.
2. **Confirm the property address and access instructions** are current in the
   cleaning manifest (`GET /companies/:companyId/properties/:propertyId/cleaning-manifest`).
3. **Monitor for marketplace confirmation** — the vendor (Handy/Turno) will
   confirm or decline. If declined, escalate manually.
4. **If the emergency is guest-facing:**
   - Communicate with the guest about timing.
   - Offer compensation if appropriate (partial refund, late checkout).
5. **After cleaning is done**, ensure the task is marked `completed` via the
   API.

## What the support team should do (future)

1. Monitor the `/telemetry` dashboard for `emergency.clean_requested` events.
2. Follow up on any emergency request not confirmed by a vendor within
   30 minutes.
3. Maintain a list of on-call local cleaners per market region as a fallback.
4. Document the root cause (no-show, guest complaint, etc.) in the incident.

## Prevention

- Keep backup cleaners assigned to every property.
- Build relationships with on-demand marketplace vendors (Handy, Turno).
- Set up same-day booking rules that block bookings without confirmed
  cleaner availability.

# Runbook: Late Checkout

## What happened

A guest has not checked out by the property's standard checkout time, and
the cleaning task cannot start on schedule. This delays the turnover and
may impact the next guest's check-in.

## System actions (automated)

The system currently detects late checkouts indirectly:
- If a cleaner checks in but reports the unit is still occupied, they should
  **not** start the task (leave it in `assigned` status).
- The no-show ladder may fire if the cleaner cannot check in on time, though
  the root cause is the guest, not the cleaner.

**Future enhancement:** PMS integration will detect late checkouts via the
booking status and automatically:
1. Notify the cleaner to wait.
2. Adjust `scheduledStartAt` on the cleaning task.
3. Notify the host.
4. If the delay exceeds 2 hours, trigger an emergency escalation.

## What the host should do

1. **Contact the guest immediately** — remind them of checkout time and any
   late checkout fees.
2. **Notify the assigned cleaner** — let them know the expected delay.
   The system will have their contact info in the cleaning manifest.
3. **If the delay is significant (> 1 hour):**
   - Reschedule the cleaning task via the API (update `scheduledStartAt`).
   - Notify the next arriving guest about a possible late check-in.
   - Consider offering the outgoing guest a late checkout fee rather than
     confrontation.
4. **If the guest refuses to leave:**
   - Follow your local jurisdiction's procedures.
   - Do NOT instruct the cleaner to enter an occupied unit.
   - Contact local authorities if necessary.

## What the support team should do (future)

1. Monitor PMS webhook events for checkout delays.
2. Auto-reschedule cleaning tasks when PMS reports late checkout.
3. Track properties with frequent late checkouts — consider adjusting
   standard checkout times or adding buffer between bookings.

## Prevention

- Set checkout reminders via guest messaging (GHL workflow) at T-2h, T-1h,
  and T-0.
- Add a 1-hour buffer between checkout and the next check-in when possible.
- Clearly communicate checkout expectations in the booking confirmation.
- Enable early check-in incentives for guests to vacate on time.

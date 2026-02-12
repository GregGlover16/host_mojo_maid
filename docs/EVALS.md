# Evals

Scenario-based evaluation runner for verifying business logic end-to-end.

## Running Evals

```bash
npm run eval
```

This runs the standalone eval harness (`eval/runner.ts`) which:
1. Pushes the Prisma schema to a separate `eval.db`
2. Resets all data and seeds deterministic test data (one company, one property, primary + backup cleaners)
3. Runs each scenario JSON file from `eval/scenarios/`
4. Asserts the expected end state matches the actual DB state
5. Writes `eval/report.json` with pass/fail + per-assertion details

Exit code is 1 if any scenario fails.

### Running eval tests via Vitest

```bash
npm run eval:test
```

This runs `vitest run tests/eval` — the original vitest-based eval tests that use the shared `test.db`.

## Scenarios

| Scenario | Description | Key Assertions |
|----------|-------------|----------------|
| `back-to-back-success` | Two consecutive bookings, both complete | 2 tasks completed, 0 incidents |
| `booking-extension-reschedule` | Booking extended, task rescheduled | Task start time updated |
| `primary-no-show-backup` | Primary no-show, backup assigned and completes | 1 NO_SHOW incident, task completed |
| `cancel-booking-cancels-task` | Booking canceled, task canceled | Task status=canceled, 0 incidents |
| `no-show-ladder-escalation` | Ladder fires remind + switch_backup steps | ladder.remind_primary fired, ladder.switch_backup fired, 1 NO_SHOW |

## Golden Files

Expected outputs for each scenario are stored in `eval/goldens/*.golden.json`. These serve as regression anchors — if a code change causes a scenario's assertions to differ from the golden file, it's a signal to investigate.

## Adding a New Scenario

1. Create `eval/scenarios/my-scenario.json` with:
   - `name`, `description`
   - `steps[]` — array of actions (see existing scenarios for the action vocabulary)
   - `expectedEndState` — key-value pairs to assert after all steps run
2. Create `eval/goldens/my-scenario.golden.json` with the expected assertions
3. The eval runner automatically picks up all `.json` files in `eval/scenarios/`

## Report Format

`eval/report.json`:
```json
{
  "runAt": "2026-02-11T23:29:36.506Z",
  "durationMs": 410,
  "scenarioCount": 5,
  "passCount": 5,
  "failCount": 0,
  "scenarios": [
    {
      "name": "back-to-back-success",
      "status": "pass",
      "durationMs": 100,
      "assertions": [
        { "field": "taskCount", "expected": 2, "actual": 2, "pass": true }
      ]
    }
  ]
}
```

## TODO (Phase 6+)

- [ ] Eval: Same-day turnover with tight checkout-to-checkin window
- [ ] Eval: Multi-property cleaner scheduling without conflicts
- [ ] Eval: Outbox event delivery and retry after transient failure
- [ ] Eval: Full ladder escalation through T+60 (host manual)
- [ ] Golden file diff comparison in the eval runner

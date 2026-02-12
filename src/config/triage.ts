/**
 * Maid Triage Engine configuration.
 * Timeouts and thresholds for the deterministic workflow engine.
 */

export const triageConfig = {
  /** Minutes after assignment before we expect cleaner confirmation. */
  CONFIRM_TIMEOUT_MINUTES: 30,

  /** Extra grace minutes after scheduled start before declaring no-show. */
  NO_SHOW_GRACE_MINUTES: 15,

  /**
   * A task is "on time" if completedAt <= scheduledEndAt.
   * This is used by the rollup DAL already; documented here for clarity.
   */
  ON_TIME_DEFINITION: 'scheduledEndAt' as const,

  // ── No-Show Ladder (Phase 4) ──
  // Each step fires at T + N minutes after the scheduled start time.

  /** Step 1: Remind the primary cleaner. */
  LADDER_REMIND_PRIMARY_MINUTES: 10,

  /** Step 2: Switch to the backup cleaner. */
  LADDER_SWITCH_BACKUP_MINUTES: 20,

  /** Step 3: Fire emergency marketplace request (Handy/Turno). */
  LADDER_EMERGENCY_REQUEST_MINUTES: 40,

  /** Step 4: Unresolved — host manual intervention (runbook link). */
  LADDER_HOST_MANUAL_MINUTES: 60,
} as const;

export type TriageConfig = typeof triageConfig;

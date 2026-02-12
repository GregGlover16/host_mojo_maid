/**
 * Interface for messaging/CRM integrations (GoHighLevel, etc.)
 *
 * Phase 0: Legacy interface kept for backward compatibility.
 * Phase 2: See notification.ts and ghl.ts for the expanded contracts.
 */
export interface IMessagingAdapter {
  /** Human-readable name of this messaging platform */
  readonly platformName: string;

  /** Send a notification to a cleaner (SMS, email, or in-app) */
  notifyCleaner(cleanerContactId: string, message: string): Promise<void>;

  /** Send a status update to the host/property manager */
  notifyHost(hostContactId: string, message: string): Promise<void>;
}

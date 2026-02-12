/**
 * Interface for notification delivery (SMS, email, push).
 * Abstracts the delivery channel so callers don't care how messages are sent.
 */

export type NotificationChannel = 'sms' | 'email' | 'push';

export interface SendNotificationInput {
  companyId: string;
  recipientId: string; // internal cleaner or host ID
  recipientType: 'cleaner' | 'host';
  channel: NotificationChannel;
  subject?: string; // required for email, optional for others
  body: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  externalMessageId: string;
  status: 'queued' | 'sent' | 'failed';
}

export interface INotificationAdapter {
  readonly adapterName: string;

  send(input: SendNotificationInput): Promise<NotificationResult>;
}

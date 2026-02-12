// Re-export all integration interfaces from a single entry point.
export type { IPmsAdapter, PmsReservation, PmsBookingWebhookPayload } from './pms';
export type {
  ITurnoAdapter,
  IBreezewayAdapter,
  IHandyAdapter,
  CreateTurnoJobInput,
  CreateBreezewayTaskInput,
  EmergencyCleaningRequest,
  VendorJobResult,
  VendorStatusWebhookPayload,
} from './cleaning-vendor';
export type {
  IGhlAdapter,
  PaymentRequestInput,
  PaymentRequestResult,
  WorkflowTriggerInput,
  WorkflowTriggerResult,
} from './ghl';
export type {
  INotificationAdapter,
  SendNotificationInput,
  NotificationResult,
  NotificationChannel,
} from './notification';
export type { IMessagingAdapter } from './messaging';

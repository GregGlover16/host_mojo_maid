/**
 * Zod schemas for validating integration payloads.
 * Every payload that enters or leaves the system goes through these schemas.
 * company_id is always required for tenant isolation.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const companyIdField = z.string().min(1, 'company_id is required');
const isoDateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO YYYY-MM-DD');
const timeField = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm');

// ---------------------------------------------------------------------------
// PMS
// ---------------------------------------------------------------------------

export const pmsReservationSchema = z.object({
  externalId: z.string().min(1),
  propertyExternalId: z.string().min(1),
  guestName: z.string().min(1),
  checkIn: isoDateField,
  checkOut: isoDateField,
  guestCount: z.number().int().positive(),
  status: z.enum(['booked', 'canceled', 'modified']),
});

export const pmsBookingWebhookSchema = z.object({
  companyId: companyIdField,
  event: z.enum(['booking.created', 'booking.modified', 'booking.canceled']),
  reservation: pmsReservationSchema,
  receivedAt: z.string().min(1),
  signatureHeader: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Turno
// ---------------------------------------------------------------------------

export const createTurnoJobSchema = z.object({
  companyId: companyIdField,
  propertyExternalId: z.string().min(1),
  taskId: z.string().min(1),
  scheduledDate: isoDateField,
  scheduledTime: timeField,
  durationMinutes: z.number().int().positive(),
  cleanerExternalId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Breezeway
// ---------------------------------------------------------------------------

export const createBreezewayTaskSchema = z.object({
  companyId: companyIdField,
  propertyExternalId: z.string().min(1),
  taskId: z.string().min(1),
  taskType: z.enum(['turnover_clean', 'deep_clean', 'inspection']),
  scheduledDate: isoDateField,
  scheduledTime: timeField,
  durationMinutes: z.number().int().positive(),
  assigneeExternalId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Handy
// ---------------------------------------------------------------------------

export const emergencyCleaningRequestSchema = z.object({
  companyId: companyIdField,
  propertyExternalId: z.string().min(1),
  taskId: z.string().min(1),
  requestedDate: isoDateField,
  requestedTime: timeField,
  urgency: z.enum(['standard', 'urgent', 'emergency']),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GHL
// ---------------------------------------------------------------------------

export const paymentRequestSchema = z.object({
  companyId: companyIdField,
  taskId: z.string().min(1),
  cleanerId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.literal('USD'),
  description: z.string().min(1),
});

export const workflowTriggerSchema = z.object({
  companyId: companyIdField,
  workflowId: z.string().min(1),
  contactId: z.string().min(1),
  triggerData: z.record(z.unknown()),
});

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

export const sendNotificationSchema = z.object({
  companyId: companyIdField,
  recipientId: z.string().min(1),
  recipientType: z.enum(['cleaner', 'host']),
  channel: z.enum(['sms', 'email', 'push']),
  subject: z.string().min(1).optional(),
  body: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Vendor status webhook (shared across Turno, Breezeway, Handy)
// ---------------------------------------------------------------------------

export const vendorStatusWebhookSchema = z.object({
  companyId: companyIdField,
  externalJobId: z.string().min(1),
  event: z.enum(['job.started', 'job.completed', 'job.canceled', 'job.failed']),
  timestamp: z.string().min(1),
  signatureHeader: z.string().min(1),
});

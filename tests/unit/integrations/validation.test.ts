import { describe, it, expect } from 'vitest';
import {
  pmsBookingWebhookSchema,
  createTurnoJobSchema,
  createBreezewayTaskSchema,
  emergencyCleaningRequestSchema,
  paymentRequestSchema,
  workflowTriggerSchema,
  sendNotificationSchema,
  vendorStatusWebhookSchema,
} from '@/integrations/validation';

describe('Integration Zod validation — company_id required', () => {
  // Each schema must reject a payload without company_id.

  it('pmsBookingWebhookSchema rejects missing companyId', () => {
    const bad = {
      // companyId missing
      event: 'booking.created',
      reservation: {
        externalId: 'r1',
        propertyExternalId: 'p1',
        guestName: 'Jane',
        checkIn: '2026-03-01',
        checkOut: '2026-03-05',
        guestCount: 2,
        status: 'booked',
      },
      receivedAt: '2026-02-28T10:00:00Z',
      signatureHeader: 'sig',
    };
    expect(() => pmsBookingWebhookSchema.parse(bad)).toThrow();
  });

  it('pmsBookingWebhookSchema rejects empty companyId', () => {
    const bad = {
      companyId: '',
      event: 'booking.created',
      reservation: {
        externalId: 'r1',
        propertyExternalId: 'p1',
        guestName: 'Jane',
        checkIn: '2026-03-01',
        checkOut: '2026-03-05',
        guestCount: 2,
        status: 'booked',
      },
      receivedAt: '2026-02-28T10:00:00Z',
      signatureHeader: 'sig',
    };
    expect(() => pmsBookingWebhookSchema.parse(bad)).toThrow();
  });

  it('createTurnoJobSchema rejects missing companyId', () => {
    const bad = {
      propertyExternalId: 'p1',
      taskId: 't1',
      scheduledDate: '2026-03-20',
      scheduledTime: '11:00',
      durationMinutes: 90,
    };
    expect(() => createTurnoJobSchema.parse(bad)).toThrow();
  });

  it('createBreezewayTaskSchema rejects missing companyId', () => {
    const bad = {
      propertyExternalId: 'p1',
      taskId: 't1',
      taskType: 'turnover_clean',
      scheduledDate: '2026-03-20',
      scheduledTime: '11:00',
      durationMinutes: 90,
    };
    expect(() => createBreezewayTaskSchema.parse(bad)).toThrow();
  });

  it('emergencyCleaningRequestSchema rejects missing companyId', () => {
    const bad = {
      propertyExternalId: 'p1',
      taskId: 't1',
      requestedDate: '2026-03-20',
      requestedTime: '14:00',
      urgency: 'emergency',
    };
    expect(() => emergencyCleaningRequestSchema.parse(bad)).toThrow();
  });

  it('paymentRequestSchema rejects missing companyId', () => {
    const bad = {
      taskId: 't1',
      cleanerId: 'c1',
      amountCents: 7500,
      currency: 'USD',
      description: 'Test',
    };
    expect(() => paymentRequestSchema.parse(bad)).toThrow();
  });

  it('workflowTriggerSchema rejects missing companyId', () => {
    const bad = {
      workflowId: 'wf1',
      contactId: 'c1',
      triggerData: {},
    };
    expect(() => workflowTriggerSchema.parse(bad)).toThrow();
  });

  it('sendNotificationSchema rejects missing companyId', () => {
    const bad = {
      recipientId: 'r1',
      recipientType: 'cleaner',
      channel: 'sms',
      body: 'Hello',
    };
    expect(() => sendNotificationSchema.parse(bad)).toThrow();
  });

  it('vendorStatusWebhookSchema rejects missing companyId', () => {
    const bad = {
      externalJobId: 'j1',
      event: 'job.completed',
      timestamp: '2026-03-20T15:00:00Z',
      signatureHeader: 'sig',
    };
    expect(() => vendorStatusWebhookSchema.parse(bad)).toThrow();
  });
});

describe('Integration Zod validation — valid payloads accepted', () => {
  it('createTurnoJobSchema accepts valid input', () => {
    const good = {
      companyId: 'pmc-001',
      propertyExternalId: 'prop-001',
      taskId: 'task-001',
      scheduledDate: '2026-03-20',
      scheduledTime: '11:00',
      durationMinutes: 90,
    };
    expect(() => createTurnoJobSchema.parse(good)).not.toThrow();
  });

  it('paymentRequestSchema accepts valid input', () => {
    const good = {
      companyId: 'pmc-001',
      taskId: 'task-001',
      cleanerId: 'cleaner-001',
      amountCents: 7500,
      currency: 'USD',
      description: 'Turnover clean',
    };
    expect(() => paymentRequestSchema.parse(good)).not.toThrow();
  });

  it('sendNotificationSchema accepts valid input with optional fields', () => {
    const good = {
      companyId: 'pmc-001',
      recipientId: 'cleaner-001',
      recipientType: 'cleaner',
      channel: 'email',
      subject: 'New Assignment',
      body: 'You have been assigned a cleaning task.',
      metadata: { taskId: 'task-001' },
    };
    expect(() => sendNotificationSchema.parse(good)).not.toThrow();
  });
});

describe('Integration Zod validation — format checks', () => {
  it('rejects invalid date format', () => {
    const bad = {
      companyId: 'pmc-001',
      propertyExternalId: 'prop-001',
      taskId: 'task-001',
      scheduledDate: '03/20/2026', // wrong format
      scheduledTime: '11:00',
      durationMinutes: 90,
    };
    expect(() => createTurnoJobSchema.parse(bad)).toThrow();
  });

  it('rejects invalid time format', () => {
    const bad = {
      companyId: 'pmc-001',
      propertyExternalId: 'prop-001',
      taskId: 'task-001',
      scheduledDate: '2026-03-20',
      scheduledTime: '11:00 AM', // wrong format
      durationMinutes: 90,
    };
    expect(() => createTurnoJobSchema.parse(bad)).toThrow();
  });

  it('rejects negative amount', () => {
    const bad = {
      companyId: 'pmc-001',
      taskId: 'task-001',
      cleanerId: 'cleaner-001',
      amountCents: -100,
      currency: 'USD',
      description: 'Bad',
    };
    expect(() => paymentRequestSchema.parse(bad)).toThrow();
  });

  it('rejects invalid vendor event type', () => {
    const bad = {
      companyId: 'pmc-001',
      externalJobId: 'j1',
      event: 'job.unknown', // invalid
      timestamp: '2026-03-20T15:00:00Z',
      signatureHeader: 'sig',
    };
    expect(() => vendorStatusWebhookSchema.parse(bad)).toThrow();
  });
});

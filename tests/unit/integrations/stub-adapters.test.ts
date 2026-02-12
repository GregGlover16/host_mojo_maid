import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OutboxDal } from '@/dal/outbox.dal';
import { StubPmsAdapter } from '@/integrations/adapters/stub-pms';
import { StubTurnoAdapter } from '@/integrations/adapters/stub-turno';
import { StubBreezewayAdapter } from '@/integrations/adapters/stub-breezeway';
import { StubHandyAdapter } from '@/integrations/adapters/stub-handy';
import { StubGhlAdapter } from '@/integrations/adapters/stub-ghl';
import { StubNotificationAdapter } from '@/integrations/adapters/stub-notification';

describe('Stub Adapters — outbox row creation', () => {
  let prisma: PrismaClient;
  let outbox: OutboxDal;
  let companyId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: 'file:./dev.db' } },
    });
    await prisma.$connect();
    outbox = new OutboxDal(prisma);

    // Get a valid company from the seeded data
    const company = await prisma.company.findFirst();
    companyId = company!.id;
  });

  beforeEach(async () => {
    // Clean outbox between tests
    await prisma.outbox.deleteMany({});
  });

  afterAll(async () => {
    await prisma.outbox.deleteMany({});
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // PMS
  // ---------------------------------------------------------------------------

  describe('StubPmsAdapter', () => {
    it('processBookingWebhook creates an outbox row with correct type', async () => {
      const adapter = new StubPmsAdapter(outbox);
      const result = await adapter.processBookingWebhook({
        companyId,
        event: 'booking.created',
        reservation: {
          externalId: 'res-001',
          propertyExternalId: 'prop-001',
          guestName: 'Test Guest',
          checkIn: '2026-03-01',
          checkOut: '2026-03-05',
          guestCount: 2,
          status: 'booked',
        },
        receivedAt: '2026-02-28T10:00:00Z',
        signatureHeader: 'sha256=test',
      });

      expect(result.accepted).toBe(true);

      const rows = await prisma.outbox.findMany({ where: { companyId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.type).toBe('pms.booking_webhook');
      expect(rows[0]!.status).toBe('pending');
      expect(rows[0]!.idempotencyKey).toBe('pms-webhook-res-001-booking.created');
    });

    it('fetchReservations returns stub data', async () => {
      const adapter = new StubPmsAdapter(outbox);
      const reservations = await adapter.fetchReservations(
        companyId,
        'prop-001',
        '2026-01-01',
        '2026-12-31',
      );
      expect(reservations).toHaveLength(1);
      expect(reservations[0]!.guestName).toBe('Stub Guest');
      expect(reservations[0]!.status).toBe('booked');
    });
  });

  // ---------------------------------------------------------------------------
  // Turno
  // ---------------------------------------------------------------------------

  describe('StubTurnoAdapter', () => {
    it('createJob writes outbox row with idempotency_key based on taskId', async () => {
      const adapter = new StubTurnoAdapter(outbox);
      const result = await adapter.createJob({
        companyId,
        propertyExternalId: 'prop-001',
        taskId: 'task-abc',
        scheduledDate: '2026-03-20',
        scheduledTime: '11:00',
        durationMinutes: 90,
      });

      expect(result.status).toBe('accepted');
      expect(result.externalJobId).toMatch(/^stub-turno-/);

      const rows = await prisma.outbox.findMany({ where: { companyId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.type).toBe('turno.create_job');
      expect(rows[0]!.idempotencyKey).toBe('turno-create-task-abc');
    });

    it('cancelJob writes outbox row', async () => {
      const adapter = new StubTurnoAdapter(outbox);
      const result = await adapter.cancelJob(companyId, 'ext-job-123');

      expect(result.canceled).toBe(true);

      const rows = await prisma.outbox.findMany({ where: { type: 'turno.cancel_job' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.idempotencyKey).toBe('turno-cancel-ext-job-123');
    });

    it('processStatusWebhook writes outbox row', async () => {
      const adapter = new StubTurnoAdapter(outbox);
      const result = await adapter.processStatusWebhook({
        companyId,
        externalJobId: 'ext-job-123',
        event: 'job.completed',
        timestamp: '2026-03-20T15:00:00Z',
        signatureHeader: 'sha256=test',
      });

      expect(result.accepted).toBe(true);

      const rows = await prisma.outbox.findMany({ where: { type: 'turno.status_webhook' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.idempotencyKey).toBe('turno-status-ext-job-123-job.completed');
    });
  });

  // ---------------------------------------------------------------------------
  // Breezeway
  // ---------------------------------------------------------------------------

  describe('StubBreezewayAdapter', () => {
    it('createTask writes outbox row with correct type', async () => {
      const adapter = new StubBreezewayAdapter(outbox);
      const result = await adapter.createTask({
        companyId,
        propertyExternalId: 'prop-001',
        taskId: 'task-bw-001',
        taskType: 'turnover_clean',
        scheduledDate: '2026-03-20',
        scheduledTime: '11:00',
        durationMinutes: 90,
      });

      expect(result.status).toBe('accepted');
      expect(result.externalJobId).toMatch(/^stub-bw-/);

      const rows = await prisma.outbox.findMany({ where: { type: 'breezeway.create_task' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.idempotencyKey).toBe('bw-create-task-bw-001');
    });
  });

  // ---------------------------------------------------------------------------
  // Handy
  // ---------------------------------------------------------------------------

  describe('StubHandyAdapter', () => {
    it('requestEmergencyCleaning writes outbox row', async () => {
      const adapter = new StubHandyAdapter(outbox);
      const result = await adapter.requestEmergencyCleaning({
        companyId,
        propertyExternalId: 'prop-001',
        taskId: 'task-emg-001',
        requestedDate: '2026-03-20',
        requestedTime: '14:00',
        urgency: 'emergency',
      });

      expect(result.status).toBe('pending');
      expect(result.externalJobId).toMatch(/^stub-handy-/);

      const rows = await prisma.outbox.findMany({ where: { type: 'handy.emergency_request' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.idempotencyKey).toBe('handy-emergency-task-emg-001');
    });

    it('getConfirmation returns stub confirmation', async () => {
      const adapter = new StubHandyAdapter(outbox);
      const result = await adapter.getConfirmation(companyId, 'ext-handy-001');

      expect(result.confirmed).toBe(true);
      expect(result.eta).toBe('14:30');
    });
  });

  // ---------------------------------------------------------------------------
  // GHL
  // ---------------------------------------------------------------------------

  describe('StubGhlAdapter', () => {
    it('requestPayment writes outbox row with correct idempotency_key', async () => {
      const adapter = new StubGhlAdapter(outbox);
      const result = await adapter.requestPayment({
        companyId,
        taskId: 'task-pay-001',
        cleanerId: 'cleaner-001',
        amountCents: 7500,
        currency: 'USD',
        description: 'Turnover clean',
      });

      expect(result.status).toBe('requested');
      expect(result.externalPaymentId).toMatch(/^stub-pay-/);

      const rows = await prisma.outbox.findMany({ where: { type: 'ghl.payment_request' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.idempotencyKey).toBe('ghl-pay-task-pay-001-cleaner-001');
    });

    it('triggerWorkflow writes outbox row', async () => {
      const adapter = new StubGhlAdapter(outbox);
      const result = await adapter.triggerWorkflow({
        companyId,
        workflowId: 'wf-post-clean',
        contactId: 'contact-001',
        triggerData: { task_id: 'task-001' },
      });

      expect(result.status).toBe('triggered');
      expect(result.externalTriggerId).toMatch(/^stub-wf-/);

      const rows = await prisma.outbox.findMany({ where: { type: 'ghl.workflow_trigger' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.idempotencyKey).toBe('ghl-wf-wf-post-clean-contact-001');
    });
  });

  // ---------------------------------------------------------------------------
  // Notification
  // ---------------------------------------------------------------------------

  describe('StubNotificationAdapter', () => {
    it('send writes outbox row with channel-specific type', async () => {
      const adapter = new StubNotificationAdapter(outbox);
      const result = await adapter.send({
        companyId,
        recipientId: 'cleaner-001',
        recipientType: 'cleaner',
        channel: 'sms',
        body: 'You have a new cleaning tomorrow.',
      });

      expect(result.status).toBe('queued');
      expect(result.externalMessageId).toMatch(/^stub-msg-/);

      const rows = await prisma.outbox.findMany({ where: { type: 'notification.sms' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.companyId).toBe(companyId);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-adapter: outbox company_id scoping
  // ---------------------------------------------------------------------------

  describe('Outbox tenant isolation', () => {
    it('every outbox row includes company_id from the input', async () => {
      const turno = new StubTurnoAdapter(outbox);
      const ghl = new StubGhlAdapter(outbox);

      await turno.createJob({
        companyId,
        propertyExternalId: 'prop-001',
        taskId: 'task-iso-001',
        scheduledDate: '2026-03-20',
        scheduledTime: '11:00',
        durationMinutes: 90,
      });

      await ghl.requestPayment({
        companyId,
        taskId: 'task-iso-001',
        cleanerId: 'cleaner-001',
        amountCents: 5000,
        currency: 'USD',
        description: 'Test',
      });

      const rows = await prisma.outbox.findMany({ where: { companyId } });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.companyId).toBe(companyId);
      }
    });
  });
});

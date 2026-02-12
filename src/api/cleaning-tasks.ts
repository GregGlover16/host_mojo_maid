import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/client';
import { CleaningTaskDal } from '../dal/cleaning-task.dal';
import { getCleaningRollup } from '../services/cleaning-rollup.service';
import { acceptTask, checkInTask, completeTask } from '../services/dispatch.service';
import { requestPayment } from '../services/payment.service';
import {
  companyIdSchema,
  entityIdSchema,
  validateDateRange,
  buildTenantContext,
} from '../types/common';

const taskDal = new CleaningTaskDal(prisma);

// ── Param schemas (Phase 6: stricter ID + date validation) ──

const companyParamSchema = z.object({
  companyId: companyIdSchema,
});

const taskParamSchema = z.object({
  companyId: companyIdSchema,
  taskId: entityIdSchema,
});

const listQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  propertyId: entityIdSchema.optional(),
  status: z
    .enum(['scheduled', 'assigned', 'in_progress', 'completed', 'canceled', 'failed'])
    .optional(),
});

const rollupQuerySchema = z.object({
  scope: z.enum(['global', 'company', 'property']).default('company'),
  propertyId: entityIdSchema.optional(),
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
});

/**
 * Cleaning task routes for the Command Center.
 * All routes are prefixed with /companies/:companyId/cleaning/
 *
 * Phase 6: Every route extracts a TenantContext and validates IDs + date ranges.
 * request.requestId is set by the request-context middleware.
 */
export async function cleaningTaskRoutes(app: FastifyInstance): Promise<void> {
  // GET /companies/:companyId/cleaning/tasks
  app.get<{
    Params: { companyId: string };
    Querystring: { dateFrom?: string; dateTo?: string; propertyId?: string; status?: string };
  }>('/companies/:companyId/cleaning/tasks', async (request, reply) => {
    const params = companyParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
    }

    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'invalid_query', message: query.error.message });
    }

    // Phase 6: validate date range if both are provided
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    if (query.data.dateFrom && query.data.dateTo) {
      const range = validateDateRange(query.data.dateFrom, query.data.dateTo);
      if (!range.valid) {
        return reply.status(400).send({ error: 'invalid_date_range', message: range.error });
      }
      dateFrom = range.from;
      dateTo = range.to;
    } else {
      dateFrom = query.data.dateFrom ? new Date(query.data.dateFrom) : undefined;
      dateTo = query.data.dateTo ? new Date(query.data.dateTo) : undefined;
    }

    const tenant = buildTenantContext(params.data.companyId);

    const tasks = await taskDal.list({
      companyId: tenant.companyId,
      propertyId: query.data.propertyId,
      dateFrom,
      dateTo,
      status: query.data.status,
    });

    return reply.send({ tasks });
  });

  // GET /companies/:companyId/cleaning/rollup
  app.get<{
    Params: { companyId: string };
    Querystring: { scope?: string; propertyId?: string; dateFrom: string; dateTo: string };
  }>('/companies/:companyId/cleaning/rollup', async (request, reply) => {
    const params = companyParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
    }

    const query = rollupQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'invalid_query', message: query.error.message });
    }

    // Phase 6: validate date range (clamped to MAX_DATE_RANGE_DAYS)
    const range = validateDateRange(query.data.dateFrom, query.data.dateTo);
    if (!range.valid) {
      return reply.status(400).send({ error: 'invalid_date_range', message: range.error });
    }

    const tenant = buildTenantContext(params.data.companyId);

    const rollup = await getCleaningRollup({
      companyId: tenant.companyId,
      propertyId: query.data.propertyId,
      dateFrom: range.from,
      dateTo: range.to,
    });

    return reply.send({ rollup });
  });

  // POST /companies/:companyId/cleaning/tasks/:taskId/cleaner-accept
  app.post<{
    Params: { companyId: string; taskId: string };
  }>('/companies/:companyId/cleaning/tasks/:taskId/cleaner-accept', async (request, reply) => {
    const params = taskParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
    }

    const tenant = buildTenantContext(params.data.companyId);
    const result = await acceptTask(tenant.companyId, params.data.taskId, request.requestId);
    if (!result.success) {
      return reply.status(409).send({ error: 'accept_failed', message: result.error });
    }

    return reply.send({ ok: true });
  });

  // POST /companies/:companyId/cleaning/tasks/:taskId/check-in
  app.post<{
    Params: { companyId: string; taskId: string };
  }>('/companies/:companyId/cleaning/tasks/:taskId/check-in', async (request, reply) => {
    const params = taskParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
    }

    const tenant = buildTenantContext(params.data.companyId);
    const result = await checkInTask(tenant.companyId, params.data.taskId, request.requestId);
    if (!result.success) {
      return reply.status(409).send({ error: 'checkin_failed', message: result.error });
    }

    return reply.send({ ok: true });
  });

  // POST /companies/:companyId/cleaning/tasks/:taskId/complete
  app.post<{
    Params: { companyId: string; taskId: string };
  }>('/companies/:companyId/cleaning/tasks/:taskId/complete', async (request, reply) => {
    const params = taskParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
    }

    const tenant = buildTenantContext(params.data.companyId);
    const result = await completeTask(tenant.companyId, params.data.taskId, request.requestId);
    if (!result.success) {
      return reply.status(409).send({ error: 'complete_failed', message: result.error });
    }

    // Trigger payment request for completed task
    const paymentResult = await requestPayment(
      tenant.companyId,
      params.data.taskId,
      request.requestId,
    );
    // Payment failure is not fatal — task is still completed
    if (!paymentResult.success) {
      request.log.warn(
        { requestId: request.requestId, error: paymentResult.error },
        'Payment request failed (non-fatal)',
      );
    }

    return reply.send({ ok: true, paymentRequested: paymentResult.success });
  });
}

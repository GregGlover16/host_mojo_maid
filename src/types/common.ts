import { z } from 'zod';

/**
 * Tenant context extracted from the request path + auth stub.
 * Every tenant-scoped query and service call MUST receive this.
 *
 * Phase 6: companyId is validated as a non-empty string at the boundary.
 * When JWT auth is added, this will also carry userId and roles.
 */
export interface TenantContext {
  /** The PMC (Property Management Company) identifier. */
  companyId: string;
}

/**
 * Zod schema for validating companyId format.
 * CUID-like IDs from Prisma are 25-char alphanumeric strings.
 * We also accept uuid-v4 and short test IDs (min 1 char).
 */
export const companyIdSchema = z
  .string()
  .min(1, 'companyId must not be empty')
  .max(64, 'companyId too long');

/**
 * Zod schema for entity IDs (taskId, propertyId, bookingId, cleanerId, etc.).
 */
export const entityIdSchema = z
  .string()
  .min(1, 'ID must not be empty')
  .max(64, 'ID too long');

/**
 * Build a TenantContext from a validated companyId.
 * Use this at the API boundary after Zod validation.
 */
export function buildTenantContext(companyId: string): TenantContext {
  return { companyId };
}

/**
 * Standard API error response shape.
 */
export interface ApiError {
  error: string;
  message?: string;
}

/**
 * Maximum allowed date range span in days.
 * Prevents unbounded queries that could time out or return too much data.
 */
export const MAX_DATE_RANGE_DAYS = 366;

/**
 * Validate and clamp a date range. Rejects ranges > MAX_DATE_RANGE_DAYS
 * and ensures dateFrom < dateTo.
 */
export function validateDateRange(
  dateFrom: string,
  dateTo: string,
): { valid: true; from: Date; to: Date } | { valid: false; error: string } {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  if (isNaN(from.getTime())) return { valid: false, error: 'dateFrom is not a valid date' };
  if (isNaN(to.getTime())) return { valid: false, error: 'dateTo is not a valid date' };
  if (from >= to) return { valid: false, error: 'dateFrom must be before dateTo' };

  const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_DATE_RANGE_DAYS) {
    return {
      valid: false,
      error: `Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days (got ${Math.round(diffDays)})`,
    };
  }

  return { valid: true, from, to };
}

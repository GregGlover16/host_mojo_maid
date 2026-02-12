// Types matching the backend Prisma models + API responses

export interface Company {
  id: string;
  name: string;
  marketRegion: string;
}

export interface Property {
  id: string;
  companyId: string;
  name: string;
  addressCity: string;
  addressState: string;
  timezone: string;
  bedrooms: number;
  bathrooms: number;
  standardCheckinTime: string;
  standardCheckoutTime: string;
  cleaningDurationMinutes: number;
  defaultCleanerId: string | null;
}

export interface Cleaner {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  email: string;
  status: "active" | "inactive";
  reliabilityScore: number;
}

export interface CleaningTask {
  id: string;
  companyId: string;
  propertyId: string;
  bookingId: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status:
    | "scheduled"
    | "assigned"
    | "in_progress"
    | "completed"
    | "canceled"
    | "failed";
  assignedCleanerId: string | null;
  vendor: string;
  vendorTaskId: string | null;
  paymentAmountCents: number;
  paymentStatus: "none" | "requested" | "paid" | "failed";
  confirmedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedCleaner: Cleaner | null;
  property: Property;
}

export interface Rollup {
  tasksTotal: number;
  tasksCompleted: number;
  onTimeRate: number;
  noShowCount: number;
  avgCleanDurationMinutes: number | null;
  paymentTotalCents: number;
}

export interface Incident {
  id: string;
  companyId: string;
  taskId: string;
  type: string;
  severity: "low" | "med" | "high";
  description: string;
  createdAt: string;
}

export interface OutboxRow {
  id: string;
  type: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  createdAt: string;
  nextAttemptAt: string | null;
}

export interface TelemetryEvent {
  id: string;
  type: string;
  companyId: string | null;
  payload: string;
  requestId: string | null;
  durationMs: number | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export type DisplayState =
  | "scheduled"
  | "assigned"
  | "in_progress"
  | "completed"
  | "canceled"
  | "at_risk";

export function getDisplayState(task: CleaningTask): DisplayState {
  if (task.status === "completed") return "completed";
  if (task.status === "in_progress") return "in_progress";
  if (task.status === "scheduled") return "scheduled";
  if (task.status === "canceled") return "canceled";
  if (task.status === "failed") return "at_risk";

  // status === 'assigned'
  if (task.confirmedAt !== null) return "assigned";

  const now = new Date();
  const start = new Date(task.scheduledStartAt);
  const thirtyMinFromNow = new Date(now.getTime() + 30 * 60_000);

  if (start <= now) return "at_risk";
  if (start <= thirtyMinFromNow) return "at_risk";

  return "assigned";
}

export interface FilterState {
  scope: "global" | "company" | "property";
  companyId: string | null;
  propertyId: string | null;
  dateFrom: string;
  dateTo: string;
}

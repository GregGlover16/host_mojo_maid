/**
 * Interface for external cleaning vendor integrations (Turno, Breezeway, Handy).
 *
 * Phase 2: Split into vendor-specific adapters.
 * Each adapter writes an Outbox row instead of calling the internet.
 */

// Common result returned after scheduling a cleaning job externally.
export interface VendorJobResult {
  externalJobId: string;
  status: 'accepted' | 'pending' | 'rejected';
}

// Webhook payload when a vendor reports status changes.
export interface VendorStatusWebhookPayload {
  companyId: string;
  externalJobId: string;
  event: 'job.started' | 'job.completed' | 'job.canceled' | 'job.failed';
  timestamp: string; // ISO timestamp
  signatureHeader: string;
}

// ---------------------------------------------------------------------------
// Turno
// ---------------------------------------------------------------------------

export interface CreateTurnoJobInput {
  companyId: string;
  propertyExternalId: string;
  taskId: string;
  scheduledDate: string; // ISO YYYY-MM-DD
  scheduledTime: string; // HH:mm
  durationMinutes: number;
  cleanerExternalId?: string;
}

export interface ITurnoAdapter {
  readonly vendorName: 'Turno';

  createJob(input: CreateTurnoJobInput): Promise<VendorJobResult>;
  updateJob(
    companyId: string,
    externalJobId: string,
    updates: Partial<CreateTurnoJobInput>,
  ): Promise<VendorJobResult>;
  cancelJob(companyId: string, externalJobId: string): Promise<{ canceled: boolean }>;
  processStatusWebhook(payload: VendorStatusWebhookPayload): Promise<{ accepted: boolean }>;
}

// ---------------------------------------------------------------------------
// Breezeway
// ---------------------------------------------------------------------------

export interface CreateBreezewayTaskInput {
  companyId: string;
  propertyExternalId: string;
  taskId: string;
  taskType: 'turnover_clean' | 'deep_clean' | 'inspection';
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  assigneeExternalId?: string;
}

export interface IBreezewayAdapter {
  readonly vendorName: 'Breezeway';

  createTask(input: CreateBreezewayTaskInput): Promise<VendorJobResult>;
  updateTask(
    companyId: string,
    externalTaskId: string,
    updates: Partial<CreateBreezewayTaskInput>,
  ): Promise<VendorJobResult>;
  syncStatus(companyId: string, externalTaskId: string): Promise<{ status: string }>;
  processStatusWebhook(payload: VendorStatusWebhookPayload): Promise<{ accepted: boolean }>;
}

// ---------------------------------------------------------------------------
// Handy (emergency cleaning)
// ---------------------------------------------------------------------------

export interface EmergencyCleaningRequest {
  companyId: string;
  propertyExternalId: string;
  taskId: string;
  requestedDate: string;
  requestedTime: string;
  urgency: 'standard' | 'urgent' | 'emergency';
  notes?: string;
}

export interface IHandyAdapter {
  readonly vendorName: 'Handy';

  requestEmergencyCleaning(input: EmergencyCleaningRequest): Promise<VendorJobResult>;
  getConfirmation(
    companyId: string,
    externalJobId: string,
  ): Promise<{ confirmed: boolean; eta?: string }>;
}

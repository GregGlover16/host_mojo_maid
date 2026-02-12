/**
 * Interface for GoHighLevel (GHL) integration.
 *
 * GHL handles payment workflows and CRM triggers.
 * Our system only creates "payment requests" — actual payment processing
 * lives in GHL or the PMS, never in this system.
 */

export interface PaymentRequestInput {
  companyId: string;
  taskId: string;
  cleanerId: string;
  amountCents: number;
  currency: 'USD';
  description: string;
}

export interface PaymentRequestResult {
  externalPaymentId: string;
  status: 'requested' | 'rejected';
}

export interface WorkflowTriggerInput {
  companyId: string;
  workflowId: string;
  contactId: string;
  triggerData: Record<string, unknown>;
}

export interface WorkflowTriggerResult {
  externalTriggerId: string;
  status: 'triggered' | 'failed';
}

export interface IGhlAdapter {
  readonly platformName: 'GHL';

  /** Create a payment request (does NOT process payment — GHL does that) */
  requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult>;

  /** Trigger a GHL workflow (e.g. post-cleaning follow-up) */
  triggerWorkflow(input: WorkflowTriggerInput): Promise<WorkflowTriggerResult>;
}

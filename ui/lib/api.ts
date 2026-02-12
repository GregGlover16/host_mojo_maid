// API client — all calls go through Next.js rewrite proxy to Fastify backend

import type {
  CleaningTask,
  Cleaner,
  Company,
  Incident,
  OutboxRow,
  Property,
  Rollup,
  TelemetryEvent,
} from "./types";

const BASE = "/api";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Companies ──

export async function getCompanies(): Promise<Company[]> {
  return fetchJSON<Company[]>(`${BASE}/companies`);
}

// ── Properties ──

export async function getProperties(companyId: string): Promise<Property[]> {
  return fetchJSON<Property[]>(
    `${BASE}/companies/${companyId}/properties`
  );
}

// ── Cleaning Tasks ──

interface ListTasksParams {
  companyId: string;
  dateFrom?: string;
  dateTo?: string;
  propertyId?: string;
  status?: string;
}

export async function listTasks(
  params: ListTasksParams
): Promise<CleaningTask[]> {
  const qs = new URLSearchParams();
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.propertyId) qs.set("propertyId", params.propertyId);
  if (params.status) qs.set("status", params.status);

  const data = await fetchJSON<{ tasks: CleaningTask[] }>(
    `${BASE}/companies/${params.companyId}/cleaning/tasks?${qs}`
  );
  return data.tasks;
}

// ── Rollup ──

interface RollupParams {
  companyId: string;
  dateFrom: string;
  dateTo: string;
  scope?: "global" | "company" | "property";
  propertyId?: string;
}

export async function getRollup(params: RollupParams): Promise<Rollup> {
  const qs = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    scope: params.scope || "company",
  });
  if (params.propertyId) qs.set("propertyId", params.propertyId);

  const data = await fetchJSON<{ rollup: Rollup }>(
    `${BASE}/companies/${params.companyId}/cleaning/rollup?${qs}`
  );
  return data.rollup;
}

// ── Task Actions ──

export async function acceptTask(
  companyId: string,
  taskId: string
): Promise<{ ok: boolean }> {
  return postJSON(
    `${BASE}/companies/${companyId}/cleaning/tasks/${taskId}/cleaner-accept`
  );
}

export async function checkInTask(
  companyId: string,
  taskId: string
): Promise<{ ok: boolean }> {
  return postJSON(
    `${BASE}/companies/${companyId}/cleaning/tasks/${taskId}/check-in`
  );
}

export async function completeTask(
  companyId: string,
  taskId: string
): Promise<{ ok: boolean; paymentRequested: boolean }> {
  return postJSON(
    `${BASE}/companies/${companyId}/cleaning/tasks/${taskId}/complete`
  );
}

export async function requestEmergencyCleaning(
  companyId: string,
  body: { propertyId: string; neededBy: string; reason: string }
): Promise<{ ok: boolean; incidentId: string; outboxId: string }> {
  return postJSON(
    `${BASE}/companies/${companyId}/cleaning/emergency-request`,
    body
  );
}

// ── Cleaners ──

export async function getCleaners(companyId: string): Promise<Cleaner[]> {
  return fetchJSON<Cleaner[]>(
    `${BASE}/companies/${companyId}/cleaners`
  );
}

// ── Incidents ──

export async function getIncidents(companyId: string): Promise<Incident[]> {
  return fetchJSON<Incident[]>(
    `${BASE}/companies/${companyId}/incidents`
  );
}

// ── Outbox ──

export async function getOutboxRows(companyId: string): Promise<OutboxRow[]> {
  return fetchJSON<OutboxRow[]>(
    `${BASE}/companies/${companyId}/outbox`
  );
}

// ── Telemetry Events ──

export async function getEvents(limit?: number): Promise<TelemetryEvent[]> {
  const qs = limit ? `?limit=${limit}` : "";
  return fetchJSON<TelemetryEvent[]>(`${BASE}/telemetry/events${qs}`);
}

// ── Outbox Summary ──

export async function getOutboxSummary(): Promise<
  Record<string, number>
> {
  return fetchJSON<Record<string, number>>(`${BASE}/telemetry/outbox-summary`);
}

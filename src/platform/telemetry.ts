import { APP_VERSION } from "./localPersistence";

export interface EditorTelemetryEvent {
  name: string;
  at: string;
  revision: number;
  durationMs?: number;
  result?: "ok" | "blocked" | "error";
  counts?: Record<string, number>;
}

export interface TelemetrySnapshot {
  kind: "creator-surface.diagnostics";
  version: 1;
  appVersion: string;
  exportedAt: string;
  telemetry: EditorTelemetryEvent[];
}

const TELEMETRY_LIMIT = 100;
let telemetryEvents: EditorTelemetryEvent[] = [];

export function recordTelemetryEvent(event: Omit<EditorTelemetryEvent, "at"> & { at?: string }): EditorTelemetryEvent {
  const safeEvent: EditorTelemetryEvent = {
    name: event.name,
    at: event.at ?? new Date().toISOString(),
    revision: event.revision,
    ...(event.durationMs === undefined ? {} : { durationMs: Math.round(event.durationMs * 100) / 100 }),
    ...(event.result === undefined ? {} : { result: event.result }),
    ...(event.counts === undefined ? {} : { counts: { ...event.counts } }),
  };
  telemetryEvents = [...telemetryEvents, safeEvent].slice(-TELEMETRY_LIMIT);
  return safeEvent;
}

export function getTelemetryEvents(): EditorTelemetryEvent[] {
  return telemetryEvents.map((event) => ({
    ...event,
    ...(event.counts ? { counts: { ...event.counts } } : {}),
  }));
}

export function clearTelemetryEvents(): void {
  telemetryEvents = [];
}

export function telemetrySnapshot(): TelemetrySnapshot {
  return {
    kind: "creator-surface.diagnostics",
    version: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    telemetry: getTelemetryEvents(),
  };
}

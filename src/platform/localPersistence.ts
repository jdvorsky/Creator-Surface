import type { WorldDocument } from "../domain/model";
import { validateUnknownWorld } from "../domain/validation";

export const WORLD_STORAGE_KEY = "creator-surface:world:v1";
export const DRAFT_STORAGE_KEY = "creator-surface:draft-recovery:v1";
export const APP_VERSION = "0.1.0";

export interface PersistedWorldSnapshot {
  kind: "creator-surface.world";
  version: 1;
  appVersion: string;
  savedAt: string;
  revision: number;
  world: WorldDocument;
}

export interface SourceDraftRecovery {
  kind: "creator-surface.source-draft";
  version: 1;
  savedAt: string;
  baseRevision: number;
  text: string;
}

export interface LocalDataSnapshot {
  persistedWorld: PersistedWorldSnapshot | null;
  draftRecovery: SourceDraftRecovery | null;
}

export function readLocalData(storage = browserStorage()): LocalDataSnapshot {
  return {
    persistedWorld: readPersistedWorldSnapshot(storage),
    draftRecovery: readSourceDraftRecovery(storage),
  };
}

export function savePersistedWorldSnapshot(world: WorldDocument, revision: number, storage = browserStorage()): PersistedWorldSnapshot | null {
  if (!storage) return null;
  const validation = validateUnknownWorld(structuredClone(world));
  if (!validation.ok) return null;
  const snapshot: PersistedWorldSnapshot = {
    kind: "creator-surface.world",
    version: 1,
    appVersion: APP_VERSION,
    savedAt: new Date().toISOString(),
    revision,
    world: validation.world,
  };
  try {
    storage.setItem(WORLD_STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

export function readPersistedWorldSnapshot(storage = browserStorage()): PersistedWorldSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WORLD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.kind !== "creator-surface.world" || parsed.version !== 1) return null;
    if (typeof parsed.appVersion !== "string" || typeof parsed.savedAt !== "string" || typeof parsed.revision !== "number") return null;
    const validation = validateUnknownWorld(parsed.world);
    if (!validation.ok) return null;
    return {
      kind: "creator-surface.world",
      version: 1,
      appVersion: parsed.appVersion,
      savedAt: parsed.savedAt,
      revision: parsed.revision,
      world: validation.world,
    };
  } catch {
    return null;
  }
}

export function saveSourceDraftRecovery(text: string, baseRevision: number, storage = browserStorage()): SourceDraftRecovery | null {
  if (!storage) return null;
  const recovery: SourceDraftRecovery = {
    kind: "creator-surface.source-draft",
    version: 1,
    savedAt: new Date().toISOString(),
    baseRevision,
    text,
  };
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(recovery));
    return recovery;
  } catch {
    return null;
  }
}

export function readSourceDraftRecovery(storage = browserStorage()): SourceDraftRecovery | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.kind !== "creator-surface.source-draft" || parsed.version !== 1) return null;
    if (typeof parsed.savedAt !== "string" || typeof parsed.baseRevision !== "number" || typeof parsed.text !== "string") return null;
    return {
      kind: "creator-surface.source-draft",
      version: 1,
      savedAt: parsed.savedAt,
      baseRevision: parsed.baseRevision,
      text: parsed.text,
    };
  } catch {
    return null;
  }
}

export function clearSourceDraftRecovery(storage = browserStorage()): void {
  try {
    storage?.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage can fail in private or restricted browser contexts.
  }
}

export function clearLocalEditorData(storage = browserStorage()): void {
  try {
    storage?.removeItem(WORLD_STORAGE_KEY);
    storage?.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage can fail in private or restricted browser contexts.
  }
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

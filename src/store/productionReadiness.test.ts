import { beforeEach, describe, expect, it } from "vitest";
import { buildWorldIndex } from "../domain/indexing";
import { serializeWorld } from "../domain/serialization";
import { sampleWorld } from "../domain/sampleWorld";
import type { WorldDocument } from "../domain/model";
import { getCommandJournalEntries } from "../platform/changeJournal";
import {
  DRAFT_STORAGE_KEY,
  WORLD_STORAGE_KEY,
  readPersistedWorldSnapshot,
  readSourceDraftRecovery,
  savePersistedWorldSnapshot,
  saveSourceDraftRecovery,
} from "../platform/localPersistence";
import { getTelemetryEvents } from "../platform/telemetry";
import { useEditorStore } from "./editorStore";

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
}

function cloneWorld(mutator: (world: WorldDocument) => void): WorldDocument {
  const world = structuredClone(useEditorStore.getState().world);
  mutator(world);
  return world;
}

describe("editor store production-readiness hooks", () => {
  beforeEach(() => {
    resetStore();
  });

  it("persists valid committed worlds after real visual commands and records local telemetry", () => {
    useEditorStore.getState().renameEntity("character_mira", "Mira Persisted");

    const snapshot = readPersistedWorldSnapshot();
    const entity = buildWorldIndex(snapshot?.world ?? sampleWorld).entitiesById.get("character_mira");

    expect(snapshot?.revision).toBe(1);
    expect(entity?.name).toBe("Mira Persisted");
    expect(getTelemetryEvents()).toEqual([expect.objectContaining({ name: "entity.rename", revision: 1, result: "ok" })]);
    expect(getCommandJournalEntries()).toEqual([
      expect.objectContaining({
        revision: 1,
        commandKind: "entity.rename",
        affectedIds: ["character_mira"],
        result: "ok",
      }),
    ]);
  });

  it("does not persist invalid source drafts as authoritative world state", () => {
    useEditorStore.getState().setSourceText('{"schemaVersion": 1,');
    const result = useEditorStore.getState().applySource();

    expect(result).toMatchObject({ ok: false, reason: "syntax" });
    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(readSourceDraftRecovery()).toMatchObject({
      kind: "creator-surface.source-draft",
      text: '{"schemaVersion": 1,',
    });
  });

  it("restores a saved local world only after explicit detection and user action", () => {
    const savedWorld = cloneWorld((world) => {
      world.name = "Saved Tideglass";
    });
    savePersistedWorldSnapshot(savedWorld, 12);

    expect(useEditorStore.getState().world.name).toBe(sampleWorld.name);

    useEditorStore.getState().detectLocalData();
    expect(useEditorStore.getState().localData.persistedWorld?.world.name).toBe("Saved Tideglass");

    useEditorStore.getState().restorePersistedWorld();
    expect(useEditorStore.getState().world.name).toBe("Saved Tideglass");
    expect(useEditorStore.getState().revision).toBe(12);
    expect(useEditorStore.getState().source.status).toBe("synced");
  });

  it("ignores malformed local world snapshots and keeps the sample world", () => {
    window.localStorage.setItem(WORLD_STORAGE_KEY, "{");

    useEditorStore.getState().detectLocalData();
    useEditorStore.getState().restorePersistedWorld();

    expect(useEditorStore.getState().localData.persistedWorld).toBeNull();
    expect(useEditorStore.getState().world.name).toBe(sampleWorld.name);
  });

  it("restores draft recovery as non-authoritative source text and preserves stale base revision", () => {
    const draft = serializeWorld(
      cloneWorld((world) => {
        const entity = buildWorldIndex(world).entitiesById.get("character_mira");
        if (!entity) throw new Error("Missing character_mira");
        entity.name = "Recovered Draft Mira";
      }),
    );
    saveSourceDraftRecovery(draft, 9);

    useEditorStore.getState().detectLocalData();
    useEditorStore.getState().restoreSourceDraft();

    const state = useEditorStore.getState();
    expect(buildWorldIndex(state.world).entitiesById.get("character_mira")?.name).toBe("Mira the Cartographer");
    expect(state.source.text).toBe(draft);
    expect(state.source.status).toBe("dirty");
    expect(state.source.baseRevision).toBe(9);
    expect(state.source.isStale).toBe(true);
  });

  it("clears local storage and local banner state from the store action", () => {
    savePersistedWorldSnapshot(sampleWorld, 1);
    saveSourceDraftRecovery("draft", 1);
    useEditorStore.getState().detectLocalData();

    useEditorStore.getState().clearLocalData();

    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(useEditorStore.getState().localData).toEqual({ persistedWorld: null, draftRecovery: null });
    expect(getTelemetryEvents()).toContainEqual(expect.objectContaining({ name: "local.clear_data" }));
  });

  it("records reset-to-sample as a local document replacement journal entry", () => {
    useEditorStore.getState().renameEntity("character_mira", "Mira Reset Candidate");

    useEditorStore.getState().resetToSampleWorld();

    expect(useEditorStore.getState().world.name).toBe(sampleWorld.name);
    expect(useEditorStore.getState().revision).toBe(0);
    expect(getTelemetryEvents()).toContainEqual(expect.objectContaining({ name: "local.reset_to_sample", revision: 0, result: "ok" }));
    expect(getCommandJournalEntries()).toContainEqual(
      expect.objectContaining({
        revision: 0,
        commandKind: "local.reset_to_sample",
        affectedIds: [sampleWorld.id],
        result: "ok",
      }),
    );
  });

  it("does not create telemetry, journal entries, or persistence writes for no-op visual commands", () => {
    const beforeRevision = useEditorStore.getState().revision;
    useEditorStore.getState().renameEntity("character_mira", "Mira the Cartographer");

    expect(useEditorStore.getState().revision).toBe(beforeRevision);
    expect(readPersistedWorldSnapshot()).toBeNull();
    expect(getTelemetryEvents()).toEqual([]);
    expect(getCommandJournalEntries()).toEqual([]);
  });
});

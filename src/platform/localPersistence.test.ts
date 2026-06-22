import { describe, expect, it } from "vitest";
import { sampleWorld } from "../domain/sampleWorld";
import {
  DRAFT_STORAGE_KEY,
  WORLD_STORAGE_KEY,
  clearLocalEditorData,
  clearSourceDraftRecovery,
  readLocalData,
  readPersistedWorldSnapshot,
  readSourceDraftRecovery,
  savePersistedWorldSnapshot,
  saveSourceDraftRecovery,
} from "./localPersistence";

describe("local persistence envelopes", () => {
  it("round-trips valid committed worlds through the versioned authoritative snapshot", () => {
    const saved = savePersistedWorldSnapshot(sampleWorld, 7);
    const loaded = readPersistedWorldSnapshot();

    expect(saved).toMatchObject({
      kind: "creator-surface.world",
      version: 1,
      revision: 7,
    });
    expect(loaded?.world.id).toBe(sampleWorld.id);
    expect(loaded?.world.scenes).toHaveLength(sampleWorld.scenes.length);
  });

  it("rejects malformed or structurally invalid world storage data", () => {
    window.localStorage.setItem(WORLD_STORAGE_KEY, "{");
    expect(readPersistedWorldSnapshot()).toBeNull();

    window.localStorage.setItem(
      WORLD_STORAGE_KEY,
      JSON.stringify({
        kind: "creator-surface.world",
        version: 1,
        appVersion: "0.1.0",
        savedAt: new Date().toISOString(),
        revision: 1,
        world: { ...sampleWorld, scenes: "not-scenes" },
      }),
    );

    expect(readPersistedWorldSnapshot()).toBeNull();
  });

  it("keeps draft recovery non-authoritative and separately clearable", () => {
    const recovery = saveSourceDraftRecovery('{"schemaVersion": 1,', 3);

    expect(recovery).toMatchObject({
      kind: "creator-surface.source-draft",
      version: 1,
      baseRevision: 3,
      text: '{"schemaVersion": 1,',
    });
    expect(readSourceDraftRecovery()?.text).toBe('{"schemaVersion": 1,');
    expect(readPersistedWorldSnapshot()).toBeNull();

    clearSourceDraftRecovery();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("reads and clears both local data envelopes together", () => {
    savePersistedWorldSnapshot(sampleWorld, 2);
    saveSourceDraftRecovery("draft", 2);

    expect(readLocalData().persistedWorld?.revision).toBe(2);
    expect(readLocalData().draftRecovery?.text).toBe("draft");

    clearLocalEditorData();
    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });
});

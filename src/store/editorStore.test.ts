import { beforeEach, describe, expect, it } from "vitest";
import { buildWorldIndex } from "../domain/indexing";
import type { EntityDocument, WorldDocument } from "../domain/model";
import { serializeWorld } from "../domain/serialization";
import { useEditorStore } from "./editorStore";

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
}

function draftFromCurrentWorld(mutator: (world: WorldDocument) => void): string {
  const world = structuredClone(useEditorStore.getState().world);
  mutator(world);
  return serializeWorld(world);
}

function entityById(world: WorldDocument, entityId: string): EntityDocument {
  const entity = buildWorldIndex(world).entitiesById.get(entityId);
  if (!entity) {
    throw new Error(`Missing entity ${entityId}`);
  }
  return entity;
}

describe("editor store source apply and synchronization", () => {
  beforeEach(() => {
    resetStore();
  });

  it("blocks malformed source without changing the committed world or revision", () => {
    const before = useEditorStore.getState();
    const committedText = serializeWorld(before.world);

    before.setSourceText('{"schemaVersion": 1,');
    const result = useEditorStore.getState().applySource();

    expect(result).toMatchObject({ ok: false, reason: "syntax" });
    expect(useEditorStore.getState().world).toBe(before.world);
    expect(useEditorStore.getState().revision).toBe(before.revision);
    expect(serializeWorld(useEditorStore.getState().world)).toBe(committedText);
    expect(useEditorStore.getState().source.status).toBe("invalid");
    expect(useEditorStore.getState().source.syntaxIssues[0]?.code).toBe("syntax.invalid_json");
  });

  it("blocks structural source issues atomically and reports Cannot apply", () => {
    const before = useEditorStore.getState();
    const text = draftFromCurrentWorld((world) => {
      entityById(world, "item_sunken_compass").position = {
        x: "left",
        y: 420,
      } as unknown as EntityDocument["position"];
    });

    before.setSourceText(text);
    const result = useEditorStore.getState().applySource();

    expect(result).toMatchObject({ ok: false, reason: "blocking-issues" });
    expect(useEditorStore.getState().world).toBe(before.world);
    expect(useEditorStore.getState().revision).toBe(before.revision);
    expect(useEditorStore.getState().source.status).toBe("cannot-apply");
    expect(useEditorStore.getState().source.structuralIssues.map((issue) => issue.code)).toContain("structure.invalid_entity_position");
  });

  it("commits recoverable portal reference issues and syncs source to the committed document", () => {
    const text = draftFromCurrentWorld((world) => {
      entityById(world, "portal_old_gate").data = {
        ...entityById(world, "portal_old_gate").data,
        target: { kind: "scene", id: "scene_missing" },
      };
    });

    useEditorStore.getState().setSourceText(text);
    const result = useEditorStore.getState().applySource();
    const state = useEditorStore.getState();

    expect(result).toMatchObject({ ok: true, revision: 1 });
    expect(state.revision).toBe(1);
    expect(state.source.status).toBe("synced");
    expect(state.source.isStale).toBe(false);
    expect(state.source.text).toContain('"scene_missing"');
    expect(state.issues.map((issue) => issue.code)).toContain("reference.portal_missing_scene");
  });

  it("treats source apply of an identical document as a no-op transaction", () => {
    const before = useEditorStore.getState();
    const minifiedSameWorld = JSON.stringify(before.world);

    before.setSourceText(minifiedSameWorld);
    expect(useEditorStore.getState().source.status).toBe("dirty");

    const result = useEditorStore.getState().applySource();
    const after = useEditorStore.getState();

    expect(result).toEqual({ ok: true, revision: before.revision });
    expect(after.world).toBe(before.world);
    expect(after.revision).toBe(before.revision);
    expect(after.history.past).toEqual([]);
    expect(after.source.status).toBe("synced");
    expect(after.source.isStale).toBe(false);
    expect(after.source.text).toBe(serializeWorld(before.world));
  });

  it("reconciles selection when the selected entity is deleted through source JSON", () => {
    useEditorStore.getState().selectEntity("scene_harbor", "item_sunken_compass");
    const text = draftFromCurrentWorld((world) => {
      const harbor = world.scenes.find((scene) => scene.id === "scene_harbor");
      if (!harbor) throw new Error("Missing harbor scene");
      harbor.entities = harbor.entities.filter((entity) => entity.id !== "item_sunken_compass");
    });

    useEditorStore.getState().setSourceText(text);
    const result = useEditorStore.getState().applySource();
    const state = useEditorStore.getState();

    expect(result.ok).toBe(true);
    expect(buildWorldIndex(state.world).entitiesById.has("item_sunken_compass")).toBe(false);
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_harbor" });
    expect(state.source.text).not.toContain("item_sunken_compass");
  });

  it("keeps dirty source text stale after visual edits and requires explicit force to apply it", () => {
    const dirtyText = draftFromCurrentWorld((world) => {
      entityById(world, "character_mira").name = "Mira From Draft";
    });
    useEditorStore.getState().setSourceText(dirtyText);

    useEditorStore.getState().renameEntity("character_mira", "Mira Visual Edit");
    const afterVisualEdit = useEditorStore.getState();

    expect(entityById(afterVisualEdit.world, "character_mira").name).toBe("Mira Visual Edit");
    expect(afterVisualEdit.source.text).toBe(dirtyText);
    expect(afterVisualEdit.source.status).toBe("dirty");
    expect(afterVisualEdit.source.isStale).toBe(true);

    const blocked = useEditorStore.getState().applySource();
    expect(blocked).toMatchObject({ ok: false, reason: "stale" });
    expect(entityById(useEditorStore.getState().world, "character_mira").name).toBe("Mira Visual Edit");

    useEditorStore.getState().setSourceText(serializeWorld(useEditorStore.getState().world));
    expect(useEditorStore.getState().source.status).toBe("synced");
    expect(useEditorStore.getState().source.isStale).toBe(false);

    useEditorStore.getState().setSourceText(dirtyText);
    useEditorStore.getState().renameEntity("character_mira", "Mira Visual Edit Again");

    const forced = useEditorStore.getState().applySource({ forceIfStale: true });
    expect(forced).toMatchObject({ ok: true });
    expect(entityById(useEditorStore.getState().world, "character_mira").name).toBe("Mira From Draft");
    expect(useEditorStore.getState().source.isStale).toBe(false);
  });

  it("renames a scene through visual edits and marks a dirty scene draft as stale", () => {
    const dirtyText = draftFromCurrentWorld((world) => {
      const harbor = world.scenes.find((scene) => scene.id === "scene_harbor");
      if (!harbor) throw new Error("Missing harbor scene");
      harbor.name = "Harbor from Draft";
    });

    useEditorStore.getState().setSourceText(dirtyText);
    useEditorStore.getState().renameScene("scene_harbor", "Harbor of Whispers");

    const afterVisualEdit = useEditorStore.getState();
    const scene = afterVisualEdit.world.scenes.find((candidate) => candidate.id === "scene_harbor");

    expect(scene?.name).toBe("Harbor of Whispers");
    expect(afterVisualEdit.source.text).toBe(dirtyText);
    expect(afterVisualEdit.source.status).toBe("dirty");
    expect(afterVisualEdit.source.isStale).toBe(true);
  });

  it("updates scene bounds through visual edits and marks a dirty source draft as stale", () => {
    const dirtyText = draftFromCurrentWorld((world) => {
      const harbor = world.scenes.find((scene) => scene.id === "scene_harbor");
      if (!harbor) throw new Error("Missing harbor scene");
      harbor.bounds = { width: 999, height: 999 };
    });
    useEditorStore.getState().setSourceText(dirtyText);

    useEditorStore.getState().setSceneBounds("scene_harbor", { width: 1500, height: 900 });

    const afterVisualEdit = useEditorStore.getState();
    const scene = afterVisualEdit.world.scenes.find((candidate) => candidate.id === "scene_harbor");

    expect(scene?.bounds).toEqual({ width: 1500, height: 900 });
    expect(afterVisualEdit.source.text).toBe(dirtyText);
    expect(afterVisualEdit.source.status).toBe("dirty");
    expect(afterVisualEdit.source.isStale).toBe(true);
  });

  it("commits an item drag through the canonical world and serialized source", () => {
    useEditorStore.getState().beginEntityDrag("item_sunken_compass");
    useEditorStore.getState().previewEntityDrag({ x: 675.555, y: 451.444 });
    useEditorStore.getState().commitEntityDrag();

    const state = useEditorStore.getState();
    const item = entityById(state.world, "item_sunken_compass");

    expect(item.position).toEqual({ x: 675.56, y: 451.44 });
    expect(state.dragPreview).toBeNull();
    expect(state.selection).toEqual({ kind: "entity", sceneId: "scene_harbor", entityId: "item_sunken_compass" });
    expect(state.history.past).toHaveLength(1);
    expect(state.source.text).toContain('"x": 675.56');
    expect(state.source.text).toContain('"y": 451.44');
  });

  it("ignores invalid numeric property positions without changing world data", () => {
    const before = useEditorStore.getState();

    before.setEntityPosition("item_sunken_compass", { x: Number.NaN, y: 10 });

    const after = useEditorStore.getState();
    expect(after.world).toBe(before.world);
    expect(after.revision).toBe(before.revision);
    expect(entityById(after.world, "item_sunken_compass").position).toEqual({ x: 610, y: 420 });
  });
});

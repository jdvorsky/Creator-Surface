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
  if (!entity) throw new Error(`Missing entity ${entityId}`);
  return entity;
}

describe("editor store transition equivalence classes", () => {
  beforeEach(() => {
    resetStore();
  });

  it("treats duplicate source object keys as blocking structural diagnostics", () => {
    const duplicateKeyDraft = `{
      "schemaVersion": 1,
      "id": "world_one",
      "id": "world_two",
      "name": "Duplicate Key World",
      "scenes": []
    }`;

    useEditorStore.getState().setSourceText(duplicateKeyDraft);
    const applyResult = useEditorStore.getState().applySource();

    expect(applyResult).toMatchObject({ ok: false, reason: "blocking-issues" });
    expect(useEditorStore.getState().source.status).toBe("cannot-apply");
    expect(useEditorStore.getState().source.structuralIssues).toEqual([
      expect.objectContaining({ code: "structure.duplicate_object_key", path: ["id"] }),
    ]);
    expect(useEditorStore.getState().world.id).toBe("world_tideglass");
  });

  it("guards invalid selection requests and resolves entity selection to its true parent scene", () => {
    const initialSelection = useEditorStore.getState().selection;

    useEditorStore.getState().selectScene("scene_missing");
    expect(useEditorStore.getState().selection).toEqual(initialSelection);

    useEditorStore.getState().selectEntity("scene_wrong", "item_vault_key");
    expect(useEditorStore.getState().selection).toEqual({
      kind: "entity",
      sceneId: "scene_ruins",
      entityId: "item_vault_key",
    });
  });

  it("creates repeatable source navigation requests for world, scenes, and entities", () => {
    useEditorStore.getState().revealSourceForSelection({ kind: "world" });
    expect(useEditorStore.getState().sourceNavigation).toEqual({ path: [], target: { kind: "world" }, requestId: 1 });
    expect(useEditorStore.getState().activeBottomTab).toBe("source");

    useEditorStore.getState().revealSourceForSelection({ kind: "scene", sceneId: "scene_ruins" });
    expect(useEditorStore.getState().sourceNavigation).toEqual({
      path: ["scenes", 1],
      target: { kind: "scene", sceneId: "scene_ruins" },
      requestId: 2,
    });

    useEditorStore.getState().revealSourceForSelection({
      kind: "entity",
      sceneId: "scene_ruins",
      entityId: "item_vault_key",
    });
    expect(useEditorStore.getState().sourceNavigation).toEqual({
      path: ["scenes", 1, "entities", 2],
      target: { kind: "entity", entityId: "item_vault_key" },
      requestId: 3,
    });

    useEditorStore.getState().revealSourceForSelection({
      kind: "entity",
      sceneId: "scene_ruins",
      entityId: "item_vault_key",
    });
    expect(useEditorStore.getState().sourceNavigation?.requestId).toBe(4);
  });

  it("creates direct source-path and focused-issue navigation requests", () => {
    useEditorStore.getState().setActiveBottomTab("problems");
    useEditorStore.getState().revealSourcePath(["scenes", 0, "entities", 3, "data", "target"]);
    useEditorStore.getState().focusIssue("reference.portal_missing_scene:portal_old_gate:scene_missing");

    expect(useEditorStore.getState().activeBottomTab).toBe("source");
    expect(useEditorStore.getState().sourceNavigation).toEqual({
      path: ["scenes", 0, "entities", 3, "data", "target"],
      requestId: 1,
    });
    expect(useEditorStore.getState().focusedIssue).toEqual({
      issueId: "reference.portal_missing_scene:portal_old_gate:scene_missing",
      requestId: 1,
    });
  });

  it("classifies source draft statuses without mutating committed world", () => {
    const state = useEditorStore.getState();
    const originalWorld = state.world;

    state.setSourceText(serializeWorld(originalWorld));
    expect(useEditorStore.getState().source.status).toBe("synced");

    state.setSourceText(draftFromCurrentWorld((world) => {
      entityById(world, "character_mira").name = "Draft Mira";
    }));
    expect(useEditorStore.getState().source.status).toBe("dirty");
    expect(entityById(useEditorStore.getState().world, "character_mira").name).toBe("Mira the Cartographer");

    state.setSourceText("{");
    expect(useEditorStore.getState().source.status).toBe("invalid");
    expect(useEditorStore.getState().source.syntaxIssues.map((issue) => issue.code)).toContain("syntax.invalid_json");

    state.setSourceText(draftFromCurrentWorld((world) => {
      entityById(world, "item_sunken_compass").position = { x: "left", y: 1 } as unknown as EntityDocument["position"];
    }));
    expect(useEditorStore.getState().source.status).toBe("cannot-apply");
    expect(useEditorStore.getState().source.structuralIssues.map((issue) => issue.code)).toContain("structure.invalid_entity_position");
    expect(useEditorStore.getState().world).toBe(originalWorld);
  });

  it.each([
    {
      name: "dirty",
      seedDraft: () =>
        draftFromCurrentWorld((world) => {
          entityById(world, "character_mira").name = "Draft Mira";
        }),
    },
    {
      name: "invalid",
      seedDraft: () => "{",
    },
    {
      name: "cannot-apply",
      seedDraft: () =>
        draftFromCurrentWorld((world) => {
          entityById(world, "item_sunken_compass").position = { x: null, y: 1 } as unknown as EntityDocument["position"];
        }),
    },
  ])("reloads a stale $name source draft from the committed world", ({ seedDraft }) => {
    const draft = seedDraft();
    useEditorStore.getState().setSourceText(draft);
    useEditorStore.getState().renameEntity("character_mira", "Visual Mira");

    expect(useEditorStore.getState().source.text).toBe(draft);
    expect(useEditorStore.getState().source.isStale).toBe(true);

    useEditorStore.getState().reloadSourceFromWorld();
    const state = useEditorStore.getState();

    expect(state.source.status).toBe("synced");
    expect(state.source.isStale).toBe(false);
    expect(state.source.text).toBe(serializeWorld(state.world));
    expect(state.source.syntaxIssues).toEqual([]);
    expect(state.source.structuralIssues).toEqual([]);
  });

  it("formats valid source drafts and preserves invalid drafts as diagnostics", () => {
    const originalWorld = useEditorStore.getState().world;
    useEditorStore.getState().setSourceText('{"schemaVersion":1,"id":"world","name":"Tiny","scenes":[]}');
    useEditorStore.getState().formatSource();

    expect(useEditorStore.getState().source.text).toContain('\n  "schemaVersion": 1,');
    expect(useEditorStore.getState().source.status).toBe("dirty");
    expect(useEditorStore.getState().world).toBe(originalWorld);

    useEditorStore.getState().setSourceText(serializeWorld(originalWorld).replace(/\n/g, ""));
    useEditorStore.getState().formatSource();

    expect(useEditorStore.getState().source.status).toBe("synced");
    expect(useEditorStore.getState().source.text).toBe(serializeWorld(originalWorld));

    useEditorStore.getState().setSourceText(draftFromCurrentWorld((world) => {
      entityById(world, "item_sunken_compass").position = { x: "left", y: 1 } as unknown as EntityDocument["position"];
    }));
    useEditorStore.getState().formatSource();

    expect(useEditorStore.getState().source.status).toBe("cannot-apply");
    expect(useEditorStore.getState().source.structuralIssues.map((issue) => issue.code)).toContain("structure.invalid_entity_position");

    useEditorStore.getState().setSourceText("{");
    useEditorStore.getState().formatSource();

    expect(useEditorStore.getState().source.status).toBe("invalid");
    expect(useEditorStore.getState().source.syntaxIssues.map((issue) => issue.code)).toContain("syntax.invalid_json");
  });

  it("keeps undo and redo as deliberate document boundaries and clears redo after a new edit", () => {
    useEditorStore.getState().renameEntity("character_mira", "First Edit");
    useEditorStore.getState().setEntityPosition("item_sunken_compass", { x: 700, y: 455 });
    expect(useEditorStore.getState().revision).toBe(2);

    useEditorStore.getState().undo();
    expect(entityById(useEditorStore.getState().world, "character_mira").name).toBe("First Edit");
    expect(entityById(useEditorStore.getState().world, "item_sunken_compass").position).toEqual({ x: 610, y: 420 });
    expect(useEditorStore.getState().history.future).toHaveLength(1);

    useEditorStore.getState().redo();
    expect(entityById(useEditorStore.getState().world, "item_sunken_compass").position).toEqual({ x: 700, y: 455 });

    useEditorStore.getState().undo();
    useEditorStore.getState().renameEntity("character_mira", "Branch Edit");
    expect(useEditorStore.getState().history.future).toEqual([]);
  });

  it("does not create a revision for serialized no-op visual edits", () => {
    const before = useEditorStore.getState();

    before.renameEntity("character_mira", "Mira the Cartographer");
    before.changeEntityType("item_sunken_compass", "item");

    expect(useEditorStore.getState().revision).toBe(before.revision);
    expect(useEditorStore.getState().history.past).toEqual([]);
  });

  it("keeps unchanged camera updates from replacing view state", () => {
    useEditorStore.getState().setSceneCamera("scene_harbor", { x: 12, y: 24, zoom: 1.5 });
    const camerasBeforeNoop = useEditorStore.getState().camerasBySceneId;

    useEditorStore.getState().setSceneCamera("scene_harbor", { x: 12, y: 24, zoom: 1.5 });

    expect(useEditorStore.getState().camerasBySceneId).toBe(camerasBeforeNoop);
  });

  it("preserves collapsed graph branches across commits unless they contain the selection", () => {
    useEditorStore.getState().selectWorld();
    useEditorStore.getState().toggleNodeExpanded("scene:scene_harbor");
    expect(useEditorStore.getState().expandedNodeIds["scene:scene_harbor"]).toBe(false);

    useEditorStore.getState().renameEntity("character_mira", "Mira While Harbor Collapsed");

    expect(useEditorStore.getState().expandedNodeIds["scene:scene_harbor"]).toBe(false);

    useEditorStore.getState().setSourceText(draftFromCurrentWorld((world) => {
      world.name = "World While Harbor Collapsed";
    }));
    useEditorStore.getState().applySource();

    expect(useEditorStore.getState().expandedNodeIds["scene:scene_harbor"]).toBe(false);
  });

  it("expands the unsupported graph group when selecting an unsupported entity", () => {
    useEditorStore.getState().setSourceText(draftFromCurrentWorld((world) => {
      entityById(world, "item_sunken_compass").type = "vehicle";
    }));
    useEditorStore.getState().applySource();
    useEditorStore.getState().toggleNodeExpanded("group:scene_harbor:unsupported");
    expect(useEditorStore.getState().expandedNodeIds["group:scene_harbor:unsupported"]).toBe(false);

    useEditorStore.getState().selectEntity("scene_harbor", "item_sunken_compass");

    expect(useEditorStore.getState().expandedNodeIds["group:scene_harbor:unsupported"]).toBe(true);
  });

  it("cancels drag previews and snaps committed drag movement when grid snapping is enabled", () => {
    const originalPosition = entityById(useEditorStore.getState().world, "item_sunken_compass").position;

    useEditorStore.getState().beginEntityDrag("item_sunken_compass");
    useEditorStore.getState().previewEntityDrag({ x: 25, y: 25 });
    useEditorStore.getState().cancelEntityDrag();

    expect(useEditorStore.getState().dragPreview).toBeNull();
    expect(entityById(useEditorStore.getState().world, "item_sunken_compass").position).toEqual(originalPosition);

    useEditorStore.setState({ snapToGrid: true, gridSize: 24 });
    useEditorStore.getState().beginEntityDrag("item_sunken_compass");
    useEditorStore.getState().previewEntityDrag({ x: 25, y: 49 });
    useEditorStore.getState().commitEntityDrag();

    expect(entityById(useEditorStore.getState().world, "item_sunken_compass").position).toEqual({ x: 24, y: 48 });
  });

  it.each([
    ["location", "marker_lighthouse"],
    ["character", "character_mira"],
    ["item", "item_sunken_compass"],
    ["portal", "portal_old_gate"],
  ])("moves a %s through the shared drag pipeline", (_type, entityId) => {
    const before = useEditorStore.getState();
    const sceneId = buildWorldIndex(before.world).sceneIdByEntityId.get(entityId);
    if (!sceneId) throw new Error(`Missing scene for ${entityId}`);

    before.beginEntityDrag(entityId);
    expect(useEditorStore.getState().dragPreview).toMatchObject({
      sceneId,
      entityId,
      origin: entityById(before.world, entityId).position,
    });

    useEditorStore.getState().previewEntityDrag({ x: 321, y: 456 });
    useEditorStore.getState().commitEntityDrag();

    const after = useEditorStore.getState();
    expect(entityById(after.world, entityId).position).toEqual({ x: 321, y: 456 });
    expect(after.dragPreview).toBeNull();
    expect(after.selection).toEqual({ kind: "entity", sceneId, entityId });
    expect(after.revision).toBe(before.revision + 1);
    expect(after.history.past).toHaveLength(before.history.past.length + 1);
    expect(after.source.text).toContain(`"id": "${entityId}"`);
    expect(after.source.text).toContain('"x": 321');
    expect(after.source.text).toContain('"y": 456');
  });

  it("creates, duplicates, and deletes entities through one canonical document path", () => {
    useEditorStore.getState().setPlacementType("item");
    useEditorStore.getState().createEntity("scene_harbor", "item", { x: 20, y: 40 });

    let state = useEditorStore.getState();
    expect(state.placementType).toBeNull();
    expect(state.selection).toEqual({ kind: "entity", sceneId: "scene_harbor", entityId: "item_new_item" });
    expect(entityById(state.world, "item_new_item").data).toEqual({ category: "other", quantity: 1, collectible: true });
    expect(state.source.text).toContain('"id": "item_new_item"');

    state.duplicateEntity("item_new_item");
    state = useEditorStore.getState();
    expect(state.selection).toEqual({ kind: "entity", sceneId: "scene_harbor", entityId: "item_new_item_copy" });
    expect(entityById(state.world, "item_new_item_copy").position).toEqual({ x: 48, y: 68 });

    state.deleteEntity("item_new_item_copy");
    state = useEditorStore.getState();
    expect(buildWorldIndex(state.world).entitiesById.has("item_new_item_copy")).toBe(false);
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_harbor" });
    expect(state.source.text).not.toContain("item_new_item_copy");
  });

  it("duplicates and deletes scenes through one canonical document path", () => {
    const before = useEditorStore.getState();

    before.duplicateScene("scene_harbor");
    let state = useEditorStore.getState();
    const duplicatedScene = state.world.scenes.at(-1);
    if (!duplicatedScene) throw new Error("Missing duplicated scene");

    expect(duplicatedScene).toMatchObject({
      id: "scene_harbor_district_copy",
      name: "Harbor District Copy",
      bounds: { width: 1000, height: 640 },
    });
    expect(duplicatedScene.entities).toHaveLength(5);
    expect(new Set(duplicatedScene.entities.map((entity) => entity.id)).size).toBe(5);
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_harbor_district_copy" });
    expect(state.revision).toBe(before.revision + 1);
    expect(state.history.past).toHaveLength(before.history.past.length + 1);
    expect(state.source.text).toContain('"id": "scene_harbor_district_copy"');

    state.deleteScene("scene_harbor_district_copy");
    state = useEditorStore.getState();

    expect(buildWorldIndex(state.world).scenesById.has("scene_harbor_district_copy")).toBe(false);
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_moonline" });
    expect(state.source.text).not.toContain("scene_harbor_district_copy");
  });

  it("reconciles scene deletion to the next scene or world when no scenes remain", () => {
    useEditorStore.getState().selectScene("scene_harbor");
    useEditorStore.getState().deleteScene("scene_harbor");

    let state = useEditorStore.getState();
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_ruins" });
    expect(buildWorldIndex(state.world).entitiesById.has("item_sunken_compass")).toBe(false);
    expect(state.issues.map((issue) => issue.code)).toContain("reference.portal_missing_scene");
    expect(state.issues.some((issue) => issue.message.includes("scene_harbor"))).toBe(true);

    useEditorStore.setState({
      world: {
        schemaVersion: 1,
        id: "world_one_scene",
        name: "One Scene",
        scenes: [{ id: "scene_only", name: "Only", bounds: { width: 10, height: 10 }, entities: [] }],
      },
      selection: { kind: "scene", sceneId: "scene_only" },
      source: {
        text: "",
        baseRevision: 0,
        status: "dirty",
        isStale: false,
        syntaxIssues: [],
        structuralIssues: [],
      },
    });

    useEditorStore.getState().deleteScene("scene_only");
    state = useEditorStore.getState();

    expect(state.world.scenes).toEqual([]);
    expect(state.selection).toEqual({ kind: "world" });
    expect(state.source.isStale).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { createReadableEntityId, slugifyIdPart } from "./ids";
import { buildWorldIndex, findSceneForEntity } from "./indexing";
import type { WorldDocument } from "./model";
import { sampleWorld } from "./sampleWorld";
import { initialSelection, reconcileSelection, selectedSceneId } from "./selection";

function cloneWorld(): WorldDocument {
  return structuredClone(sampleWorld);
}

describe("world indexing and selection reconciliation", () => {
  it("indexes scenes and entities by stable authored IDs", () => {
    const index = buildWorldIndex(sampleWorld);

    expect(index.scenesById.get("scene_harbor")?.name).toBe("Harbor District");
    expect(index.entitiesById.get("item_sunken_compass")?.name).toBe("Sunken Compass");
    expect(index.sceneIdByEntityId.get("marker_moon_shrine")).toBe("scene_ruins");
    expect(index.entityIdsBySceneId.get("scene_harbor")).toEqual([
      "marker_lighthouse",
      "character_mira",
      "item_sunken_compass",
      "portal_old_gate",
      "portal_moon_shrine",
    ]);
    expect(findSceneForEntity(sampleWorld, "item_vault_key")).toBe("scene_ruins");
  });

  it("keeps entity selection after scene reordering because IDs, not indexes, define identity", () => {
    const world = cloneWorld();
    world.scenes.reverse();

    const selection = reconcileSelection({ kind: "entity", sceneId: "scene_harbor", entityId: "item_sunken_compass" }, world);

    expect(selection).toEqual({ kind: "entity", sceneId: "scene_harbor", entityId: "item_sunken_compass" });
    expect(selectedSceneId(selection, world)).toBe("scene_harbor");
  });

  it("falls back safely when selected entities or scenes are deleted by source replacement", () => {
    const world = cloneWorld();
    world.scenes[0]!.entities = world.scenes[0]!.entities.filter((entity) => entity.id !== "item_sunken_compass");

    expect(reconcileSelection({ kind: "entity", sceneId: "scene_harbor", entityId: "item_sunken_compass" }, world)).toEqual({
      kind: "scene",
      sceneId: "scene_harbor",
    });

    world.scenes = world.scenes.filter((scene) => scene.id !== "scene_harbor");
    expect(reconcileSelection({ kind: "scene", sceneId: "scene_harbor" }, world)).toEqual({
      kind: "scene",
      sceneId: "scene_ruins",
    });

    world.scenes = [];
    expect(initialSelection(world)).toEqual({ kind: "world" });
    expect(reconcileSelection({ kind: "scene", sceneId: "scene_ruins" }, world)).toEqual({ kind: "world" });
  });

  it("preserves world selection during document reconciliation", () => {
    expect(reconcileSelection({ kind: "world" }, sampleWorld)).toEqual({ kind: "world" });
  });

  it("generates readable collision-checked entity IDs", () => {
    const world = cloneWorld();
    const index = buildWorldIndex(world);

    expect(slugifyIdPart("  Vault Key!! ")).toBe("vault_key");
    expect(slugifyIdPart("R\u00e0in & Mist!!")).toBe("rain_mist");
    expect(slugifyIdPart("\u65e5\u672c\u8a9e\u306e\u8857")).toBe("\u65e5\u672c\u8a9e\u306e\u8857");
    expect(slugifyIdPart("\ud83c\udff0 Castle")).toBe("castle");
    expect(slugifyIdPart("\u2728")).toMatch(/^entity_[a-z0-9]+$/);
    expect(createReadableEntityId("item", "Sunken Compass", index)).toBe("item_sunken_compass_2");
    expect(createReadableEntityId("portal", "New Moon Gate", index)).toBe("portal_new_moon_gate");
  });
});

import { describe, expect, it } from "vitest";
import {
  changeEntityTypeInWorld,
  createEntityInWorld,
  deleteEntityInWorld,
  deleteSceneInWorld,
  duplicateEntityInWorld,
  duplicateSceneInWorld,
  renameSceneInWorld,
  renameEntityInWorld,
  setSceneBoundsInWorld,
  setEntityPositionInWorld,
} from "./commands";
import { buildWorldIndex } from "./indexing";
import type { EntityDocument, JsonObject, SupportedEntityType, WorldDocument } from "./model";
import { sampleWorld } from "./sampleWorld";

function cloneWorld(): WorldDocument {
  return structuredClone(sampleWorld);
}

function entityById(world: WorldDocument, entityId: string): EntityDocument {
  const entity = buildWorldIndex(world).entitiesById.get(entityId);
  if (!entity) throw new Error(`Missing entity ${entityId}`);
  return entity;
}

describe("world command equivalence classes", () => {
  it("renames only the addressed entity without mutating the input world", () => {
    const world = cloneWorld();
    const next = renameEntityInWorld(world, "character_mira", "Mira Revised");

    expect(entityById(next, "character_mira").name).toBe("Mira Revised");
    expect(entityById(world, "character_mira").name).toBe("Mira the Cartographer");
    expect(entityById(next, "item_sunken_compass").name).toBe("Sunken Compass");
  });

  it("renames only the addressed scene without mutating the input world", () => {
    const world = cloneWorld();
    const next = renameSceneInWorld(world, "scene_harbor", "Harbor of Whispers");

    expect(world.scenes.find((scene) => scene.id === "scene_harbor")?.name).toBe("Harbor District");
    expect(next.scenes.find((scene) => scene.id === "scene_harbor")?.name).toBe("Harbor of Whispers");
    expect(next.scenes.find((scene) => scene.id === "scene_ruins")?.name).toBe("Moonlit Ruins");
  });

  it("updates only the addressed scene bounds without mutating the input world", () => {
    const world = cloneWorld();
    const next = setSceneBoundsInWorld(world, "scene_harbor", { width: 1920, height: 1080 });

    const harborNext = next.scenes.find((scene) => scene.id === "scene_harbor");
    const harborBefore = world.scenes.find((scene) => scene.id === "scene_harbor");

    expect(harborBefore?.bounds).toEqual({ width: 1000, height: 640 });
    expect(harborNext?.bounds).toEqual({ width: 1920, height: 1080 });
    expect(world.scenes.find((scene) => scene.id === "scene_ruins")?.bounds).toEqual({ width: 920, height: 620 });
    expect(next).not.toBe(world);
  });

  it("preserves unknown scene bounds keys when visually editing width and height", () => {
    const world = cloneWorld();
    const harbor = world.scenes.find((scene) => scene.id === "scene_harbor");
    if (!harbor) throw new Error("Missing harbor scene");
    Object.assign(harbor.bounds, { depth: 12, unit: "meters" });

    const next = setSceneBoundsInWorld(world, "scene_harbor", { width: 1500, height: 900 });

    expect(next.scenes.find((scene) => scene.id === "scene_harbor")?.bounds).toMatchObject({
      width: 1500,
      height: 900,
      depth: 12,
      unit: "meters",
    });
  });

  it("ignores invalid scene bounds without mutating the input world", () => {
    const world = cloneWorld();
    const next = setSceneBoundsInWorld(world, "scene_harbor", { width: 0, height: 800 });

    expect(next).toBe(world);
    expect(world.scenes.find((scene) => scene.id === "scene_harbor")?.bounds).toEqual({ width: 1000, height: 640 });
  });

  it("rounds finite positions and rejects nonfinite placement as a no-op", () => {
    const world = cloneWorld();
    const moved = setEntityPositionInWorld(world, "item_sunken_compass", { x: 14.125, y: 20.999 });
    const ignored = setEntityPositionInWorld(world, "item_sunken_compass", { x: Number.NaN, y: 20 });

    expect(entityById(moved, "item_sunken_compass").position).toEqual({ x: 14.13, y: 21 });
    expect(ignored).toBe(world);
  });

  it("preserves unknown entity position keys when visually moving an entity", () => {
    const world = cloneWorld();
    Object.assign(entityById(world, "item_sunken_compass").position, { z: 7, note: "upper shelf" });

    const next = setEntityPositionInWorld(world, "item_sunken_compass", { x: 14.125, y: 20.999 });

    expect(entityById(next, "item_sunken_compass").position).toMatchObject({
      x: 14.13,
      y: 21,
      z: 7,
      note: "upper shelf",
    });
  });

  it("merges supported type defaults while preserving existing unknown data and metadata", () => {
    const world = cloneWorld();
    const entity = entityById(world, "item_sunken_compass");
    entity.type = "vehicle";
    entity.data = { engine: "tidal" };
    entity.metadata = { custom: "preserved" };

    const next = changeEntityTypeInWorld(world, "item_sunken_compass", "character");
    const converted = entityById(next, "item_sunken_compass");

    expect(converted.type).toBe("character");
    expect(converted.data).toMatchObject({ role: "other", disposition: "neutral", level: 1, engine: "tidal" });
    expect(converted.metadata).toMatchObject({ tags: [], custom: "preserved" });
  });

  it("keeps portal target data when changing away from portal", () => {
    const world = cloneWorld();
    const next = changeEntityTypeInWorld(world, "portal_old_gate", "item");
    const converted = entityById(next, "portal_old_gate");

    expect(converted.type).toBe("item");
    expect(converted.data).toMatchObject({
      category: "other",
      quantity: 1,
      collectible: true,
      target: { kind: "scene", id: "scene_ruins" },
      oneWay: false,
      activation: "interact",
    });
  });

  it("changes to an unsupported type without injecting or stripping data", () => {
    const world = cloneWorld();
    const beforeData = structuredClone(entityById(world, "item_sunken_compass").data);
    const beforeMetadata = structuredClone(entityById(world, "item_sunken_compass").metadata);
    const next = changeEntityTypeInWorld(world, "item_sunken_compass", "vehicle");
    const converted = entityById(next, "item_sunken_compass");

    expect(converted.type).toBe("vehicle");
    expect(converted.data).toEqual(beforeData);
    expect(converted.metadata).toEqual(beforeMetadata);
  });

  it.each([
    ["location", { category: "landmark", discoveryRadius: 0 }],
    ["character", { role: "other", disposition: "neutral", level: 1 }],
    ["item", { category: "other", quantity: 1, collectible: true }],
    ["portal", { oneWay: false, activation: "interact" }],
  ] satisfies Array<[SupportedEntityType, JsonObject]>)("creates %s entities with registry defaults", (type, defaults) => {
    const world = cloneWorld();
    const next = createEntityInWorld(world, "scene_harbor", type, { x: 33.337, y: 44.444 }, `${type}_new`, `New ${type}`);
    const created = entityById(next, `${type}_new`);

    expect(created).toMatchObject({
      id: `${type}_new`,
      type,
      name: `New ${type}`,
      position: { x: 33.34, y: 44.44 },
      data: defaults,
    });
    expect(created.metadata).toEqual({ tags: [] });
    expect(buildWorldIndex(world).entitiesById.has(`${type}_new`)).toBe(false);
  });

  it("duplicates an entity into its parent scene with copied authored data and an offset position", () => {
    const world = cloneWorld();
    const next = duplicateEntityInWorld(world, "item_sunken_compass", "item_sunken_compass_copy");
    const copy = entityById(next, "item_sunken_compass_copy");
    const original = entityById(world, "item_sunken_compass");

    expect(copy).toMatchObject({
      id: "item_sunken_compass_copy",
      name: "Sunken Compass Copy",
      type: original.type,
      position: { x: original.position.x + 28, y: original.position.y + 28 },
      data: original.data,
      metadata: original.metadata,
    });
    expect(buildWorldIndex(next).sceneIdByEntityId.get("item_sunken_compass_copy")).toBe("scene_harbor");
  });

  it("rejects nonfinite creation positions without mutating the input world", () => {
    const world = cloneWorld();
    const next = createEntityInWorld(world, "scene_harbor", "item", { x: Number.NaN, y: 40 }, "item_bad", "Bad Item");

    expect(next).toBe(world);
    expect(buildWorldIndex(next).entitiesById.has("item_bad")).toBe(false);
  });

  it("deletes the addressed entity while preserving other scenes and entities", () => {
    const world = cloneWorld();
    const next = deleteEntityInWorld(world, "item_sunken_compass");
    const index = buildWorldIndex(next);

    expect(index.entitiesById.has("item_sunken_compass")).toBe(false);
    expect(index.entitiesById.has("character_mira")).toBe(true);
    expect(index.entitiesById.has("item_vault_key")).toBe(true);
    expect(world.scenes[0]?.entities.some((entity) => entity.id === "item_sunken_compass")).toBe(true);
  });

  it("duplicates a scene with unique entity IDs and remapped internal portal targets", () => {
    const world = cloneWorld();
    entityById(world, "portal_old_gate").data = { target: { kind: "scene", id: "scene_harbor" } };
    entityById(world, "portal_moon_shrine").data = { target: { kind: "entity", id: "item_sunken_compass" } };

    const next = duplicateSceneInWorld(world, "scene_harbor", "scene_harbor_copy", {
      marker_lighthouse: "marker_lighthouse_copy",
      character_mira: "character_mira_copy",
      item_sunken_compass: "item_sunken_compass_copy",
      portal_old_gate: "portal_old_gate_copy",
      portal_moon_shrine: "portal_moon_shrine_copy",
    });
    const copy = next.scenes.find((scene) => scene.id === "scene_harbor_copy");
    if (!copy) throw new Error("Missing duplicated scene");

    expect(copy.name).toBe("Harbor District Copy");
    expect(copy.bounds).toEqual({ width: 1000, height: 640 });
    expect(copy.entities.map((entity) => entity.id)).toEqual([
      "marker_lighthouse_copy",
      "character_mira_copy",
      "item_sunken_compass_copy",
      "portal_old_gate_copy",
      "portal_moon_shrine_copy",
    ]);
    expect(entityById(next, "portal_old_gate_copy").data?.target).toEqual({ kind: "scene", id: "scene_harbor_copy" });
    expect(entityById(next, "portal_moon_shrine_copy").data?.target).toEqual({
      kind: "entity",
      id: "item_sunken_compass_copy",
    });
    expect(buildWorldIndex(world).scenesById.has("scene_harbor_copy")).toBe(false);
  });

  it("rejects unsafe scene duplication IDs without mutating the input world", () => {
    const world = cloneWorld();
    const validMap = {
      marker_lighthouse: "marker_lighthouse_copy",
      character_mira: "character_mira_copy",
      item_sunken_compass: "item_sunken_compass_copy",
      portal_old_gate: "portal_old_gate_copy",
      portal_moon_shrine: "portal_moon_shrine_copy",
    };

    expect(duplicateSceneInWorld(world, "scene_harbor", "scene_ruins", validMap)).toBe(world);
    expect(duplicateSceneInWorld(world, "scene_harbor", "scene_harbor_copy", { marker_lighthouse: "marker_lighthouse_copy" })).toBe(world);
    expect(
      duplicateSceneInWorld(world, "scene_harbor", "scene_harbor_copy", {
        ...validMap,
        marker_lighthouse: "item_sunken_compass",
      }),
    ).toBe(world);
  });

  it("deletes a scene and its entities without mutating the input world", () => {
    const world = cloneWorld();
    const next = deleteSceneInWorld(world, "scene_harbor");
    const index = buildWorldIndex(next);

    expect(index.scenesById.has("scene_harbor")).toBe(false);
    expect(index.entitiesById.has("item_sunken_compass")).toBe(false);
    expect(index.scenesById.has("scene_ruins")).toBe(true);
    expect(buildWorldIndex(world).scenesById.has("scene_harbor")).toBe(true);
    expect(deleteSceneInWorld(next, "scene_missing")).toBe(next);
  });
});

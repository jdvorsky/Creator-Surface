import { describe, expect, it } from "vitest";
import { sampleWorld } from "./sampleWorld";
import { serializeWorld } from "./serialization";
import { mapRepresentability, parseJsonSource, validateUnknownWorld } from "./validation";
import type { ValidationIssue, WorldDocument } from "./model";

function cloneWorld(): WorldDocument {
  return structuredClone(sampleWorld);
}

function expectValidWorld(value: unknown) {
  const result = validateUnknownWorld(value);
  if (!result.ok) {
    throw new Error(`Expected world to validate, got: ${result.issues.map((issue) => issue.message).join("; ")}`);
  }
  return result;
}

function expectBlockedWorld(value: unknown) {
  const result = validateUnknownWorld(value);
  if (result.ok) {
    throw new Error("Expected world validation to be blocked.");
  }
  return result;
}

function codes(issues: ValidationIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

describe("world validation and serialization", () => {
  it("accepts the sample world and serializes it as stable two-space JSON", () => {
    const result = expectValidWorld(sampleWorld);

    expect(result.issues).toEqual([]);
    const serialized = serializeWorld(result.world);

    expect(serialized).toBe(`${JSON.stringify(sampleWorld, null, 2)}\n`);
    expect(JSON.parse(serialized)).toEqual(sampleWorld);
  });

  it("ships the expanded P1 sample world with sparse and crowded scenes", () => {
    const entityCounts = sampleWorld.scenes.map((scene) => scene.entities.length);

    expect(sampleWorld.scenes).toHaveLength(6);
    expect(sampleWorld.scenes.map((scene) => scene.id)).toEqual([
      "scene_harbor",
      "scene_ruins",
      "scene_fogbank",
      "scene_aurora_grotto",
      "scene_market_lane",
      "scene_moonline",
    ]);
    expect(entityCounts.some((count) => count <= 2)).toBe(true);
    expect(entityCounts.some((count) => count >= 8)).toBe(true);
  });

  it("preserves unknown world, scene, entity, data, and metadata keys through validation", () => {
    const world = cloneWorld();
    const scene = world.scenes[0]!;
    const entity = scene.entities[2]!;

    world.metadata = { ...world.metadata, authorNote: "keep this" };
    scene.metadata = { ...scene.metadata, tide: "spring" };
    entity.data = { ...entity.data, hiddenChecksum: "abc123" };
    entity.metadata = { ...entity.metadata, customFlag: true };

    const result = expectValidWorld(world);
    const parsed = JSON.parse(serializeWorld(result.world)) as WorldDocument;

    expect(parsed.metadata?.authorNote).toBe("keep this");
    expect(parsed.scenes[0]?.metadata?.tide).toBe("spring");
    expect(parsed.scenes[0]?.entities[2]?.data?.hiddenChecksum).toBe("abc123");
    expect(parsed.scenes[0]?.entities[2]?.metadata?.customFlag).toBe(true);
  });

  it("blocks missing required fields, duplicate IDs, collisions, invalid containers, and unsafe positions", () => {
    const missingName = cloneWorld() as unknown as { name?: unknown };
    delete missingName.name;
    expect(codes(expectBlockedWorld(missingName).issues)).toContain("structure.required_string");

    const duplicateScene = cloneWorld();
    duplicateScene.scenes[1]!.id = duplicateScene.scenes[0]!.id;
    expect(codes(expectBlockedWorld(duplicateScene).issues)).toContain("identity.duplicate_scene_id");

    const duplicateEntity = cloneWorld();
    duplicateEntity.scenes[1]!.entities[0]!.id = duplicateEntity.scenes[0]!.entities[0]!.id;
    expect(codes(expectBlockedWorld(duplicateEntity).issues)).toContain("identity.duplicate_entity_id");

    const sceneEntityCollision = cloneWorld();
    sceneEntityCollision.scenes[0]!.entities[0]!.id = sceneEntityCollision.scenes[1]!.id;
    expect(codes(expectBlockedWorld(sceneEntityCollision).issues)).toContain("identity.scene_entity_id_collision");

    const invalidDataContainer = cloneWorld();
    Object.assign(invalidDataContainer.scenes[0]!.entities[0]!, { data: "not an object" as unknown });
    expect(codes(expectBlockedWorld(invalidDataContainer).issues)).toContain("structure.object_expected");

    const invalidPosition = cloneWorld();
    invalidPosition.scenes[0]!.entities[2]!.position = {
      x: "left",
      y: 420,
    } as unknown as WorldDocument["scenes"][number]["entities"][number]["position"];
    expect(codes(expectBlockedWorld(invalidPosition).issues)).toContain("structure.invalid_entity_position");
  });

  it("commits recoverable portal, type, spatial, and metadata problems as actionable issues", () => {
    const world = cloneWorld();
    const harbor = world.scenes[0]!;

    harbor.entities[0]!.position.x = harbor.bounds.width + 40;
    harbor.entities[1]!.data = { ...harbor.entities[1]!.data, level: 0 };
    harbor.entities[1]!.metadata = { ...harbor.entities[1]!.metadata, tags: ["maps", "maps"] };
    harbor.entities[2]!.metadata = { ...harbor.entities[2]!.metadata, rarity: "mythic" };
    harbor.entities[3]!.data = { ...harbor.entities[3]!.data, target: { kind: "scene", id: "scene_missing" } };
    harbor.entities[4]!.data = { oneWay: true };
    world.scenes[1]!.entities[1]!.type = "vehicle";

    const result = expectValidWorld(world);
    const issueCodes = codes(result.issues);

    expect(issueCodes).toEqual(
      expect.arrayContaining([
        "metadata.character_level",
        "metadata.duplicate_tag",
        "metadata.item_rarity",
        "reference.portal_missing_scene",
        "reference.portal_missing_target",
        "spatial.position_out_of_bounds",
        "unsupported.entity_type",
      ]),
    );
    expect(result.issues.find((issue) => issue.code === "metadata.item_rarity")?.message).toContain("mythic");
    expect(result.issues.find((issue) => issue.code === "reference.portal_missing_scene")?.message).toContain("scene_missing");
    expect(result.issues.every((issue) => !issue.blocking)).toBe(true);
  });

  it("reports malformed portal targets without dropping the portal from the committed world", () => {
    const world = cloneWorld();
    const portal = world.scenes[0]!.entities[3]!;
    portal.data = { ...portal.data, target: { kind: "chapter", id: "" } };

    const result = expectValidWorld(world);

    const issueCodes = codes(result.issues);

    expect(result.world.scenes[0]?.entities[3]?.id).toBe("portal_old_gate");
    expect(issueCodes.some((code) => code.startsWith("metadata.portal_target"))).toBe(true);
    expect(issueCodes).toContain("reference.portal_invalid_target");
  });

  it("classifies supported entities as full map projections and unknown types as fallback projections", () => {
    const world = cloneWorld();
    world.scenes[0]!.entities[2]!.type = "vehicle";

    const result = expectValidWorld(world);
    const projections = mapRepresentability(result.world);

    expect(projections.find((projection) => projection.entityId === "character_mira")?.status).toBe("fully represented");
    expect(projections.find((projection) => projection.entityId === "item_sunken_compass")?.status).toBe("fallback represented");
  });

  it("returns a blocking syntax issue with parser location detail for malformed JSON", () => {
    const result = parseJsonSource('{"schemaVersion": 1,');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({
      code: "syntax.invalid_json",
      blocking: true,
      category: "syntax",
    });
    expect(result.issues[0]?.message).toContain("Invalid JSON");
  });
});

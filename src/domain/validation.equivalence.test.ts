import { describe, expect, it } from "vitest";
import { buildWorldIndex } from "./indexing";
import type { EntityDocument, JsonObject, ValidationIssue, WorldDocument } from "./model";
import { sampleWorld } from "./sampleWorld";
import { mapRepresentability, parseJsonSource, pathText, validateUnknownWorld } from "./validation";

function cloneWorld(): WorldDocument {
  return structuredClone(sampleWorld);
}

function entityById(world: WorldDocument, entityId: string): EntityDocument {
  const entity = buildWorldIndex(world).entitiesById.get(entityId);
  if (!entity) throw new Error(`Missing entity ${entityId}`);
  return entity;
}

function sceneById(world: WorldDocument, sceneId: string) {
  const scene = world.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Missing scene ${sceneId}`);
  return scene;
}

function expectBlocked(value: unknown): ValidationIssue[] {
  const result = validateUnknownWorld(value);
  if (result.ok) throw new Error("Expected blocking validation failure.");
  return result.issues;
}

function expectValid(value: unknown): { world: WorldDocument; issues: ValidationIssue[] } {
  const result = validateUnknownWorld(value);
  if (!result.ok) throw new Error(`Expected valid world, got ${result.issues.map((issue) => issue.code).join(", ")}`);
  return result;
}

function blockingCodes(value: unknown): string[] {
  return expectBlocked(value).map((issue) => issue.code);
}

function semanticIssues(mutator: (world: WorldDocument) => void): ValidationIssue[] {
  const world = cloneWorld();
  mutator(world);
  return expectValid(world).issues;
}

function semanticCodes(mutator: (world: WorldDocument) => void): string[] {
  return semanticIssues(mutator).map((issue) => issue.code);
}

describe("validation equivalence classes", () => {
  it.each([
    {
      name: "root value is not an object",
      value: null,
      code: "structure.world_object",
    },
    {
      name: "schema version is unsupported",
      value: () => ({ ...cloneWorld(), schemaVersion: 2 }),
      code: "structure.invalid_schema_version",
    },
    {
      name: "world id is missing",
      value: () => {
        const world = cloneWorld() as unknown as { id?: unknown };
        delete world.id;
        return world;
      },
      code: "structure.required_string",
    },
    {
      name: "world scenes is not an array",
      value: () => ({ ...cloneWorld(), scenes: "nope" }),
      code: "structure.world_scenes",
    },
    {
      name: "world metadata is not an object",
      value: () => ({ ...cloneWorld(), metadata: [] }),
      code: "structure.object_expected",
    },
    {
      name: "scene is not an object",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes, { 0: "scene" as unknown });
        return world;
      },
      code: "structure.scene_object",
    },
    {
      name: "scene id is missing",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!, { id: undefined as unknown });
        return world;
      },
      code: "structure.required_string",
    },
    {
      name: "scene name is missing",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!, { name: undefined as unknown });
        return world;
      },
      code: "structure.required_string",
    },
    {
      name: "scene bounds are missing",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!, { bounds: undefined as unknown });
        return world;
      },
      code: "structure.scene_bounds",
    },
    {
      name: "scene bounds width is zero",
      value: () => {
        const world = cloneWorld();
        world.scenes[0]!.bounds.width = 0;
        return world;
      },
      code: "structure.invalid_scene_bounds",
    },
    {
      name: "scene bounds height is infinite",
      value: () => {
        const world = cloneWorld();
        world.scenes[0]!.bounds.height = Number.POSITIVE_INFINITY;
        return world;
      },
      code: "structure.invalid_scene_bounds",
    },
    {
      name: "scene entities is not an array",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!, { entities: "entities" as unknown });
        return world;
      },
      code: "structure.scene_entities",
    },
    {
      name: "scene metadata is not an object",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!, { metadata: "metadata" as unknown });
        return world;
      },
      code: "structure.object_expected",
    },
    {
      name: "entity is not an object",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!.entities, { 0: "entity" as unknown });
        return world;
      },
      code: "structure.entity_object",
    },
    {
      name: "entity id is missing",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!.entities[0]!, { id: undefined as unknown });
        return world;
      },
      code: "structure.required_string",
    },
    {
      name: "entity type is missing",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!.entities[0]!, { type: undefined as unknown });
        return world;
      },
      code: "structure.required_string",
    },
    {
      name: "entity name is missing",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!.entities[0]!, { name: undefined as unknown });
        return world;
      },
      code: "structure.required_string",
    },
    {
      name: "entity position is missing",
      value: () => {
        const world = cloneWorld();
        Object.assign(world.scenes[0]!.entities[0]!, { position: undefined as unknown });
        return world;
      },
      code: "structure.invalid_entity_position",
    },
    {
      name: "entity position x is nonnumeric",
      value: () => {
        const world = cloneWorld();
        Object.assign(entityById(world, "item_sunken_compass").position, { x: "left" as unknown });
        return world;
      },
      code: "structure.invalid_entity_position",
    },
    {
      name: "entity position y is nonfinite",
      value: () => {
        const world = cloneWorld();
        entityById(world, "item_sunken_compass").position.y = Number.NaN;
        return world;
      },
      code: "structure.invalid_entity_position",
    },
    {
      name: "entity data is an array",
      value: () => {
        const world = cloneWorld();
        Object.assign(entityById(world, "item_sunken_compass"), { data: [] as unknown });
        return world;
      },
      code: "structure.object_expected",
    },
    {
      name: "entity metadata is primitive",
      value: () => {
        const world = cloneWorld();
        Object.assign(entityById(world, "item_sunken_compass"), { metadata: false as unknown });
        return world;
      },
      code: "structure.object_expected",
    },
  ])("blocks unsafe structure: $name", ({ value, code }) => {
    const input = typeof value === "function" ? value() : value;
    expect(blockingCodes(input)).toContain(code);
  });

  it.each([
    {
      name: "empty scene id",
      mutate: (world: WorldDocument) => {
        world.scenes[0]!.id = "";
      },
      code: "identity.empty_id",
    },
    {
      name: "empty entity id",
      mutate: (world: WorldDocument) => {
        world.scenes[0]!.entities[0]!.id = " ";
      },
      code: "identity.empty_id",
    },
    {
      name: "duplicate scene id",
      mutate: (world: WorldDocument) => {
        world.scenes[1]!.id = world.scenes[0]!.id;
      },
      code: "identity.duplicate_scene_id",
    },
    {
      name: "duplicate entity id",
      mutate: (world: WorldDocument) => {
        world.scenes[1]!.entities[0]!.id = world.scenes[0]!.entities[0]!.id;
      },
      code: "identity.duplicate_entity_id",
    },
    {
      name: "scene/entity id collision",
      mutate: (world: WorldDocument) => {
        world.scenes[0]!.entities[0]!.id = world.scenes[1]!.id;
      },
      code: "identity.scene_entity_id_collision",
    },
  ])("blocks unsafe identity: $name", ({ mutate, code }) => {
    const world = cloneWorld();
    mutate(world);
    expect(blockingCodes(world)).toContain(code);
  });

  it("reports every duplicate ID path in identity issue messages", () => {
    const world = cloneWorld();
    world.scenes[1]!.id = world.scenes[0]!.id;
    world.scenes[1]!.entities[0]!.id = world.scenes[0]!.entities[0]!.id;

    const issues = expectBlocked(world);

    expect(issues.find((issue) => issue.code === "identity.duplicate_scene_id")?.message).toContain(
      "$.scenes[0].id, $.scenes[1].id",
    );
    expect(issues.find((issue) => issue.code === "identity.duplicate_entity_id")?.message).toContain(
      "$.scenes[0].entities[0].id, $.scenes[1].entities[0].id",
    );
  });

  it.each([
    {
      name: "empty scene name is a warning",
      mutate: (world: WorldDocument) => {
        world.scenes[0]!.name = " ";
      },
      code: "metadata.scene_empty_name",
      severity: "warning",
    },
    {
      name: "empty entity name is a warning",
      mutate: (world: WorldDocument) => {
        entityById(world, "character_mira").name = "";
      },
      code: "metadata.entity_empty_name",
      severity: "warning",
    },
    {
      name: "negative x is out of bounds",
      mutate: (world: WorldDocument) => {
        entityById(world, "item_sunken_compass").position.x = -1;
      },
      code: "spatial.position_out_of_bounds",
      severity: "warning",
    },
    {
      name: "unknown type is fallback represented",
      mutate: (world: WorldDocument) => {
        entityById(world, "item_sunken_compass").type = "vehicle";
      },
      code: "unsupported.entity_type",
      severity: "error",
    },
  ])("commits recoverable renderable issue: $name", ({ mutate, code, severity }) => {
    const issues = semanticIssues(mutate);
    const issue = issues.find((candidate) => candidate.code === code);
    expect(issue).toMatchObject({ code, severity, blocking: false });
  });

  it.each([
    {
      name: "description too long",
      entityId: "marker_lighthouse",
      metadata: { description: "x".repeat(2_001) },
      code: "metadata.location_description",
    },
    {
      name: "tags is not an array",
      entityId: "marker_lighthouse",
      metadata: { tags: "beacon" },
      code: "metadata.location_tags",
    },
    {
      name: "tags exceeds maximum count",
      entityId: "marker_lighthouse",
      metadata: { tags: Array.from({ length: 21 }, (_, index) => `tag${index}`) },
      code: "metadata.location_tags",
    },
    {
      name: "tag is empty",
      entityId: "marker_lighthouse",
      metadata: { tags: [""] },
      code: "metadata.location_tags_0",
    },
    {
      name: "tag has whitespace",
      entityId: "marker_lighthouse",
      metadata: { tags: [" space"] },
      code: "metadata.location_tags_0",
    },
    {
      name: "tag is too long",
      entityId: "marker_lighthouse",
      metadata: { tags: ["x".repeat(33)] },
      code: "metadata.location_tags_0",
    },
    {
      name: "duplicate tags warn",
      entityId: "marker_lighthouse",
      metadata: { tags: ["beacon", "beacon"] },
      code: "metadata.duplicate_tag",
    },
  ])("validates common metadata class: $name", ({ entityId, metadata, code }) => {
    expect(
      semanticCodes((world) => {
        entityById(world, entityId).metadata = metadata as JsonObject;
      }),
    ).toContain(code);
  });

  it.each([
    {
      name: "invalid location category",
      entityId: "marker_lighthouse",
      data: { category: "secret" },
      code: "metadata.location_category",
    },
    {
      name: "negative discovery radius",
      entityId: "marker_lighthouse",
      data: { discoveryRadius: -1 },
      code: "metadata.location_discoveryRadius",
    },
    {
      name: "invalid location region",
      entityId: "marker_lighthouse",
      metadata: { region: "" },
      code: "metadata.location_region",
    },
    {
      name: "invalid character role",
      entityId: "character_mira",
      data: { role: "oracle" },
      code: "metadata.character_role",
    },
    {
      name: "invalid character disposition",
      entityId: "character_mira",
      data: { disposition: "sleepy" },
      code: "metadata.character_disposition",
    },
    {
      name: "character level below range",
      entityId: "character_mira",
      data: { level: 0 },
      code: "metadata.character_level",
    },
    {
      name: "character level above range",
      entityId: "character_mira",
      data: { level: 101 },
      code: "metadata.character_level",
    },
    {
      name: "character level not integer",
      entityId: "character_mira",
      data: { level: 1.5 },
      code: "metadata.character_level",
    },
    {
      name: "invalid character faction",
      entityId: "character_mira",
      metadata: { faction: "" },
      code: "metadata.character_faction",
    },
    {
      name: "invalid item category",
      entityId: "item_sunken_compass",
      data: { category: "currency" },
      code: "metadata.item_category",
    },
    {
      name: "item quantity below range",
      entityId: "item_sunken_compass",
      data: { quantity: 0 },
      code: "metadata.item_quantity",
    },
    {
      name: "item quantity above range",
      entityId: "item_sunken_compass",
      data: { quantity: 10_000 },
      code: "metadata.item_quantity",
    },
    {
      name: "item quantity not integer",
      entityId: "item_sunken_compass",
      data: { quantity: 2.5 },
      code: "metadata.item_quantity",
    },
    {
      name: "item collectible is not boolean",
      entityId: "item_sunken_compass",
      data: { collectible: "yes" },
      code: "metadata.item_collectible",
    },
    {
      name: "invalid item rarity",
      entityId: "item_sunken_compass",
      metadata: { rarity: "mythic" },
      code: "metadata.item_rarity",
    },
    {
      name: "portal oneWay is not boolean",
      entityId: "portal_old_gate",
      data: { oneWay: "no" },
      code: "metadata.portal_oneWay",
    },
    {
      name: "portal activation is invalid",
      entityId: "portal_old_gate",
      data: { activation: "manual" },
      code: "metadata.portal_activation",
    },
    {
      name: "portal transitionLabel is empty",
      entityId: "portal_old_gate",
      metadata: { transitionLabel: "" },
      code: "metadata.portal_transitionLabel",
    },
  ])("validates type-specific data and metadata: $name", ({ entityId, data, metadata, code }) => {
    expect(
      semanticCodes((world) => {
        const entity = entityById(world, entityId);
        if (data) entity.data = { ...(entity.data ?? {}), ...data };
        if (metadata) entity.metadata = { ...(entity.metadata ?? {}), ...metadata };
      }),
    ).toContain(code);
  });

  it.each([
    {
      name: "missing portal target",
      mutate: (world: WorldDocument) => {
        entityById(world, "portal_old_gate").data = { oneWay: false };
      },
      code: "reference.portal_missing_target",
    },
    {
      name: "malformed portal target scalar",
      mutate: (world: WorldDocument) => {
        entityById(world, "portal_old_gate").data = { target: "scene_ruins" };
      },
      code: "reference.portal_invalid_target",
    },
    {
      name: "malformed portal target kind",
      mutate: (world: WorldDocument) => {
        entityById(world, "portal_old_gate").data = { target: { kind: "chapter", id: "scene_ruins" } };
      },
      code: "reference.portal_invalid_target",
    },
    {
      name: "missing scene target",
      mutate: (world: WorldDocument) => {
        entityById(world, "portal_old_gate").data = { target: { kind: "scene", id: "scene_missing" } };
      },
      code: "reference.portal_missing_scene",
    },
    {
      name: "missing entity target",
      mutate: (world: WorldDocument) => {
        entityById(world, "portal_old_gate").data = { target: { kind: "entity", id: "entity_missing" } };
      },
      code: "reference.portal_missing_entity",
    },
    {
      name: "self-targeting portal",
      mutate: (world: WorldDocument) => {
        entityById(world, "portal_old_gate").data = { target: { kind: "entity", id: "portal_old_gate" } };
      },
      code: "reference.portal_self_target",
    },
  ])("validates portal reference class: $name", ({ mutate, code }) => {
    expect(semanticCodes(mutate)).toContain(code);
  });

  it("allows valid cross-scene entity portal targets without semantic issues", () => {
    const issues = semanticIssues((world) => {
      entityById(world, "portal_old_gate").data = { target: { kind: "entity", id: "marker_moon_shrine" } };
    });

    expect(issues.filter((issue) => issue.entityId === "portal_old_gate")).toEqual([]);
  });

  it("allows valid same-scene entity portal targets without semantic issues", () => {
    const issues = semanticIssues((world) => {
      entityById(world, "portal_old_gate").data = { target: { kind: "entity", id: "marker_lighthouse" } };
    });

    expect(issues.filter((issue) => issue.entityId === "portal_old_gate")).toEqual([]);
  });

  it("classifies map representation for all valid addressable entities", () => {
    const world = cloneWorld();
    entityById(world, "item_sunken_compass").type = "vehicle";
    const projections = mapRepresentability(expectValid(world).world);

    expect(projections).toHaveLength(30);
    expect(projections.filter((projection) => projection.status === "fully represented")).toHaveLength(29);
    expect(projections.filter((projection) => projection.status === "fallback represented")).toHaveLength(1);
  });

  it("classifies degraded known-type data and broken references as fallback represented", () => {
    const world = cloneWorld();
    entityById(world, "marker_lighthouse").data = { category: "landmark", discoveryRadius: -1 };
    entityById(world, "portal_old_gate").data = { target: { kind: "scene", id: "scene_missing" } };
    const projections = mapRepresentability(expectValid(world).world);

    expect(projections.find((projection) => projection.entityId === "marker_lighthouse")?.status).toBe("fallback represented");
    expect(projections.find((projection) => projection.entityId === "portal_old_gate")?.status).toBe("fallback represented");
    expect(projections.find((projection) => projection.entityId === "item_sunken_compass")?.status).toBe("fully represented");
  });

  it("formats JSON paths consistently for issue navigation labels", () => {
    expect(pathText([])).toBe("$");
    expect(pathText(["scenes", 0, "entities", 2, "position", "x"])).toBe("$.scenes[0].entities[2].position.x");
  });

  it("parses valid JSON as unknown without committing it", () => {
    const result = parseJsonSource('{"hello": true}');

    expect(result).toEqual({ ok: true, value: { hello: true } });
  });

  it("blocks duplicate JSON object keys before parsing can overwrite authored data", () => {
    const text = `{
      "schemaVersion": 1,
      "id": "world_one",
      "id": "world_two",
      "name": "Duplicate Key World",
      "scenes": []
    }`;
    const result = parseJsonSource(text);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected duplicate key failure");
    expect(result.issues[0]).toMatchObject({
      code: "structure.duplicate_object_key",
      category: "structure",
      path: ["id"],
      blocking: true,
    });
    expect(result.issues[0]?.message).toContain('Duplicate object key "id"');
    expect(result.issues[0]?.sourceRange?.from).toBeGreaterThan(text.indexOf('"world_one"'));
  });

  it("reports every duplicate JSON object key in one parse pass", () => {
    const text = `{
      "schemaVersion": 1,
      "id": "world_one",
      "id": "world_two",
      "name": "Duplicate Key World",
      "metadata": {
        "tone": "bright",
        "tone": "dark"
      },
      "scenes": [
        {
          "id": "scene_one",
          "id": "scene_two",
          "name": "Scene",
          "bounds": { "width": 100, "height": 100 },
          "entities": []
        }
      ]
    }`;
    const result = parseJsonSource(text);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected duplicate key failure");
    expect(result.issues.map((issue) => issue.path)).toEqual([["id"], ["metadata", "tone"], ["scenes", 0, "id"]]);
  });

  it("keeps unknown type data and metadata intact while reporting fallback issue", () => {
    const world = cloneWorld();
    const entity = entityById(world, "item_sunken_compass");
    entity.type = "vehicle";
    entity.data = { engine: "tidal", quantity: 1 };
    entity.metadata = { custom: "preserved", rarity: "legendary" };

    const result = expectValid(world);
    const parsedEntity = entityById(result.world, "item_sunken_compass");

    expect(result.issues.map((issue) => issue.code)).toContain("unsupported.entity_type");
    expect(parsedEntity.data).toEqual({ engine: "tidal", quantity: 1 });
    expect(parsedEntity.metadata).toEqual({ custom: "preserved", rarity: "legendary" });
  });

  it("preserves unknown scene bounds and entity position keys through source validation", () => {
    const world = cloneWorld();
    const harbor = sceneById(world, "scene_harbor");
    const item = entityById(world, "item_sunken_compass");
    Object.assign(harbor.bounds, { depth: 12, unit: "meters" });
    Object.assign(item.position, { z: 7, note: "upper shelf" });

    const result = expectValid(world);

    expect(sceneById(result.world, "scene_harbor").bounds).toMatchObject({
      width: 1000,
      height: 640,
      depth: 12,
      unit: "meters",
    });
    expect(entityById(result.world, "item_sunken_compass").position).toMatchObject({
      x: 610,
      y: 420,
      z: 7,
      note: "upper shelf",
    });
  });

  it("reports field-specific structural paths for invalid bounds and positions", () => {
    const world = cloneWorld();
    sceneById(world, "scene_harbor").bounds.height = 0;
    Object.assign(entityById(world, "item_sunken_compass").position, { x: "left" as unknown, y: undefined as unknown });

    const issues = expectBlocked(world);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "structure.invalid_scene_bounds", path: ["scenes", 0, "bounds", "height"] }),
        expect.objectContaining({
          code: "structure.invalid_entity_position",
          path: ["scenes", 0, "entities", 2, "position", "x"],
        }),
        expect.objectContaining({
          code: "structure.invalid_entity_position",
          path: ["scenes", 0, "entities", 2, "position", "y"],
        }),
      ]),
    );
  });

  it("commits an empty but addressable world with no scenes", () => {
    const world = cloneWorld();
    world.scenes = [];

    const result = expectValid(world);

    expect(result.world.scenes).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it("commits an empty scene as a representable spatial surface", () => {
    const world = cloneWorld();
    const removedCount = sceneById(world, "scene_harbor").entities.length;
    sceneById(world, "scene_harbor").entities = [];

    const result = expectValid(world);

    expect(result.world.scenes[0]?.entities).toEqual([]);
    expect(mapRepresentability(result.world)).toHaveLength(mapRepresentability(cloneWorld()).length - removedCount);
  });
});

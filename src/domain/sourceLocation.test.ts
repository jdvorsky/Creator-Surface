import { describe, expect, it } from "vitest";
import { serializeWorld } from "./serialization";
import { locateJsonPath, locateNearestJsonPath, sourcePathForTarget } from "./sourceLocation";
import { sampleWorld } from "./sampleWorld";

describe("source JSON location", () => {
  const text = serializeWorld(sampleWorld);

  it("locates a selected scene by JSON path", () => {
    const range = locateJsonPath(text, ["scenes", 1]);

    expect(range).not.toBeNull();
    expect(text.slice(range?.from, range?.to)).toContain('"id": "scene_ruins"');
  });

  it("locates an entity object instead of a portal target reference with the same ID", () => {
    const range = locateJsonPath(text, ["scenes", 1, "entities", 0]);
    const snippet = text.slice(range?.from, range?.to);

    expect(snippet).toContain('"id": "marker_moon_shrine"');
    expect(snippet).toContain('"name": "Moon Shrine"');
    expect(snippet).not.toContain('"target"');
  });

  it("returns null for invalid paths or invalid JSON drafts", () => {
    expect(locateJsonPath(text, ["scenes", 99])).toBeNull();
    expect(locateJsonPath("{", ["scenes", 0])).toBeNull();
  });

  it("falls back to the nearest existing parent for missing issue leaf paths", () => {
    const world = structuredClone(sampleWorld);
    const portal = world.scenes[0]?.entities.find((entity) => entity.id === "portal_old_gate");
    if (!portal) throw new Error("Missing portal_old_gate");
    portal.data = { oneWay: false, activation: "interact" };
    const draft = serializeWorld(world);

    const range = locateNearestJsonPath(draft, ["scenes", 0, "entities", 3, "data", "target"]);
    if (!range) throw new Error("Expected fallback source range");
    const snippet = draft.slice(range.from, range.to);

    expect(snippet).toContain('"oneWay": false');
    expect(snippet).not.toContain('"id": "portal_old_gate"');
  });

  it("finds scene and entity paths by stable IDs in reordered source drafts", () => {
    const world = structuredClone(sampleWorld);
    world.scenes.reverse();
    const draft = serializeWorld(world);

    expect(sourcePathForTarget(draft, { kind: "scene", sceneId: "scene_harbor" })).toEqual(["scenes", 5]);
    expect(sourcePathForTarget(draft, { kind: "entity", entityId: "item_sunken_compass" })).toEqual([
      "scenes",
      5,
      "entities",
      2,
    ]);
    expect(sourcePathForTarget("{", { kind: "entity", entityId: "item_sunken_compass" })).toBeNull();
  });

  it("locates escaped object keys and nested array values through the parser-backed index", () => {
    const draft = '{ "a\\"b": { "items": [0, { "nested": ["first", { "target": true }] }] } }';

    const escapedKeyRange = locateJsonPath(draft, ['a"b']);
    const nestedRange = locateJsonPath(draft, ['a"b', "items", 1, "nested", 1, "target"]);

    expect(escapedKeyRange ? draft.slice(escapedKeyRange.from, escapedKeyRange.to) : null).toContain('"items"');
    expect(nestedRange ? draft.slice(nestedRange.from, nestedRange.to) : null).toBe("true");
  });

  it("invalidates the parser cache when the source text changes", () => {
    const first = '{ "scenes": [{ "id": "scene_a", "entities": [] }] }';
    const second = '{ "title": "shift offsets", "scenes": [{ "id": "scene_b", "entities": [] }] }';

    const firstRange = locateJsonPath(first, ["scenes", 0, "id"]);
    const secondRange = locateJsonPath(second, ["scenes", 0, "id"]);

    expect(firstRange ? first.slice(firstRange.from, firstRange.to) : null).toBe('"scene_a"');
    expect(secondRange ? second.slice(secondRange.from, secondRange.to) : null).toBe('"scene_b"');
  });
});

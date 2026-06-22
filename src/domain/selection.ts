import { buildWorldIndex } from "./indexing";
import type { Selection, WorldDocument, WorldIndex } from "./model";

export function initialSelection(world: WorldDocument): Selection {
  const firstScene = world.scenes[0];
  return firstScene ? { kind: "scene", sceneId: firstScene.id } : { kind: "world" };
}

export function reconcileSelection(
  previous: Selection,
  world: WorldDocument,
  index: WorldIndex = buildWorldIndex(world),
): Selection {
  if (previous.kind === "world") {
    return { kind: "world" };
  }

  if (previous.kind === "entity") {
    if (index.entitiesById.has(previous.entityId)) {
      const sceneId = index.sceneIdByEntityId.get(previous.entityId);
      if (sceneId) {
        return { kind: "entity", entityId: previous.entityId, sceneId };
      }
    }
    if (index.scenesById.has(previous.sceneId)) {
      return { kind: "scene", sceneId: previous.sceneId };
    }
  }

  if (previous.kind === "scene" && index.scenesById.has(previous.sceneId)) {
    return previous;
  }

  const firstScene = world.scenes[0];
  return firstScene ? { kind: "scene", sceneId: firstScene.id } : { kind: "world" };
}

export function selectedSceneId(selection: Selection, world: WorldDocument): string | null {
  if (selection.kind === "scene" || selection.kind === "entity") {
    return selection.sceneId;
  }
  return world.scenes[0]?.id ?? null;
}

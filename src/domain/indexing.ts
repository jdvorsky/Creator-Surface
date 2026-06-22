import type { SceneDocument, WorldDocument, WorldIndex } from "./model";

export function buildWorldIndex(world: WorldDocument): WorldIndex {
  const scenesById = new Map<string, SceneDocument>();
  const entitiesById = new Map<string, WorldDocument["scenes"][number]["entities"][number]>();
  const sceneIdByEntityId = new Map<string, string>();
  const entityIdsBySceneId = new Map<string, string[]>();

  for (const scene of world.scenes) {
    scenesById.set(scene.id, scene);
    const ids: string[] = [];
    for (const entity of scene.entities) {
      ids.push(entity.id);
      entitiesById.set(entity.id, entity);
      sceneIdByEntityId.set(entity.id, scene.id);
    }
    entityIdsBySceneId.set(scene.id, ids);
  }

  return {
    scenesById,
    entitiesById,
    sceneIdByEntityId,
    entityIdsBySceneId,
  };
}

export function findSceneForEntity(world: WorldDocument, entityId: string): string | null {
  for (const scene of world.scenes) {
    if (scene.entities.some((entity) => entity.id === entityId)) {
      return scene.id;
    }
  }
  return null;
}

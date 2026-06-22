import { isSupportedType } from "../../domain/contentTypes";
import type { EntityDocument, SceneDocument, WorldIndex } from "../../domain/model";

export function sameScenePortalConnections(scene: SceneDocument, index: WorldIndex): Array<{ from: EntityDocument; to: EntityDocument }> {
  const connections: Array<{ from: EntityDocument; to: EntityDocument }> = [];
  for (const entity of scene.entities) {
    if (entity.type !== "portal") continue;
    const target = entity.data?.target;
    if (!target || typeof target !== "object" || Array.isArray(target)) continue;
    const record = target as Record<string, unknown>;
    if (record.kind !== "entity" || typeof record.id !== "string") continue;
    const targetEntity = index.entitiesById.get(record.id);
    const targetSceneId = index.sceneIdByEntityId.get(record.id);
    if (targetEntity && targetSceneId === scene.id && isSupportedType(targetEntity.type)) {
      connections.push({ from: entity, to: targetEntity });
    }
  }
  return connections;
}

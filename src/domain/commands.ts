import { castDraft, produce } from "immer";
import { isSupportedType, mergeTypeDefaults } from "./contentTypes";
import { buildWorldIndex } from "./indexing";
import type { EntityDocument, JsonObject, Position, SceneDocument, SupportedEntityType, WorldDocument } from "./model";

export function renameEntityInWorld(world: WorldDocument, entityId: string, name: string): WorldDocument {
  return updateEntity(world, entityId, (entity) => {
    entity.name = name;
  });
}

export function renameSceneInWorld(world: WorldDocument, sceneId: string, name: string): WorldDocument {
  return produce(world, (draft) => {
    const scene = draft.scenes.find((candidate) => candidate.id === sceneId);
    if (scene) scene.name = name;
  });
}

export function changeEntityTypeInWorld(world: WorldDocument, entityId: string, type: string): WorldDocument {
  return updateEntity(world, entityId, (entity) => {
    if (entity.type === type) return;
    entity.type = type;
    if (isSupportedType(type)) {
      const merged = mergeTypeDefaults(type, entity.data, entity.metadata);
      entity.data = merged.data;
      entity.metadata = merged.metadata;
    }
  });
}

export function setEntityPositionInWorld(world: WorldDocument, entityId: string, position: Position): WorldDocument {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return world;
  }
  return updateEntity(world, entityId, (entity) => {
    entity.position = {
      ...(isJsonObject(entity.position) ? entity.position : {}),
      x: roundCoordinate(position.x),
      y: roundCoordinate(position.y),
    };
  });
}

export function createEntityInWorld(
  world: WorldDocument,
  sceneId: string,
  type: SupportedEntityType,
  position: Position,
  id: string,
  name: string,
): WorldDocument {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return world;
  }
  const defaults = mergeTypeDefaults(type, undefined, undefined);
  const entity: EntityDocument = {
    id,
    type,
    name,
    position: { x: roundCoordinate(position.x), y: roundCoordinate(position.y) },
    data: defaults.data,
    metadata: defaults.metadata,
  };
  return produce(world, (draft) => {
    draft.scenes.find((scene) => scene.id === sceneId)?.entities.push(castDraft(entity));
  });
}

export function deleteEntityInWorld(world: WorldDocument, entityId: string): WorldDocument {
  return produce(world, (draft) => {
    for (const scene of draft.scenes) {
      scene.entities = scene.entities.filter((entity) => entity.id !== entityId);
    }
  });
}

export function duplicateEntityInWorld(world: WorldDocument, entityId: string, newId: string): WorldDocument {
  const index = buildWorldIndex(world);
  const source = index.entitiesById.get(entityId);
  const sceneId = index.sceneIdByEntityId.get(entityId);
  if (!source || !sceneId) return world;
  const copy: EntityDocument = {
    ...structuredClone(source),
    id: newId,
    name: `${source.name} Copy`,
    position: { x: source.position.x + 28, y: source.position.y + 28 },
  };
  return produce(world, (draft) => {
    draft.scenes.find((scene) => scene.id === sceneId)?.entities.push(castDraft(copy));
  });
}

export function deleteSceneInWorld(world: WorldDocument, sceneId: string): WorldDocument {
  if (!world.scenes.some((scene) => scene.id === sceneId)) return world;

  return produce(world, (draft) => {
    draft.scenes = draft.scenes.filter((scene) => scene.id !== sceneId);
  });
}

export function duplicateSceneInWorld(
  world: WorldDocument,
  sceneId: string,
  newSceneId: string,
  entityIdMap: Record<string, string>,
): WorldDocument {
  const index = buildWorldIndex(world);
  const source = index.scenesById.get(sceneId);
  if (!source || !canDuplicateSceneWithIds(index, source, newSceneId, entityIdMap)) return world;

  const copy: SceneDocument = structuredClone(source);
  copy.id = newSceneId;
  copy.name = `${source.name} Copy`;
  copy.entities = copy.entities.map((entity) => {
    const newEntityId = entityIdMap[entity.id];
    if (!newEntityId) return entity;
    const entityCopy = structuredClone(entity);
    entityCopy.id = newEntityId;
    remapDuplicatedPortalTarget(entityCopy, sceneId, newSceneId, entityIdMap);
    return entityCopy;
  });

  return produce(world, (draft) => {
    draft.scenes.push(castDraft(copy));
  });
}

export function createSceneInWorld(
  world: WorldDocument,
  sceneId: string,
  name: string,
  bounds: { width: number; height: number },
): WorldDocument {
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    return world;
  }

  return produce(world, (draft) => {
    draft.scenes.push({ id: sceneId, name, bounds: { width: bounds.width, height: bounds.height }, entities: [] });
  });
}

export function setSceneBoundsInWorld(
  world: WorldDocument,
  sceneId: string,
  bounds: SceneDocument["bounds"],
): WorldDocument {
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    return world;
  }

  return produce(world, (draft) => {
    const scene = draft.scenes.find((candidate) => candidate.id === sceneId);
    if (scene) {
      scene.bounds = {
        ...(isJsonObject(scene.bounds) ? scene.bounds : {}),
        width: bounds.width,
        height: bounds.height,
      };
    }
  });
}

function updateEntity(
  world: WorldDocument,
  entityId: string,
  updater: (entity: EntityDocument & { data?: JsonObject; metadata?: JsonObject }) => void,
): WorldDocument {
  return produce(world, (draft) => {
    for (const scene of draft.scenes) {
      const entity = scene.entities.find((candidate) => candidate.id === entityId);
      if (!entity) continue;
      updater(entity as unknown as EntityDocument & { data?: JsonObject; metadata?: JsonObject });
      return;
    }
  });
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function remapDuplicatedPortalTarget(
  entity: EntityDocument,
  sourceSceneId: string,
  newSceneId: string,
  entityIdMap: Record<string, string>,
): void {
  if (!isJsonObject(entity.data)) return;
  const target = entity.data.target;
  if (!isJsonObject(target)) return;

  if (target.kind === "scene" && target.id === sourceSceneId) {
    entity.data.target = { ...target, id: newSceneId };
  }

  if (target.kind === "entity" && typeof target.id === "string") {
    const newTargetId = entityIdMap[target.id];
    if (newTargetId) entity.data.target = { ...target, id: newTargetId };
  }
}

function canDuplicateSceneWithIds(
  index: ReturnType<typeof buildWorldIndex>,
  source: SceneDocument,
  newSceneId: string,
  entityIdMap: Record<string, string>,
): boolean {
  if (newSceneId.trim().length === 0 || index.scenesById.has(newSceneId) || index.entitiesById.has(newSceneId)) {
    return false;
  }

  const reservedIds = new Set([newSceneId]);
  for (const entity of source.entities) {
    const newEntityId = entityIdMap[entity.id];
    if (
      typeof newEntityId !== "string" ||
      newEntityId.trim().length === 0 ||
      reservedIds.has(newEntityId) ||
      index.scenesById.has(newEntityId) ||
      index.entitiesById.has(newEntityId)
    ) {
      return false;
    }
    reservedIds.add(newEntityId);
  }
  return true;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type { ValidationIssue, WorldDocument } from "../model";
import { addPath, identityIssue, pathText } from "./shared";

export function validateIdentity(world: WorldDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const scenePaths = new Map<string, Array<Array<string | number>>>();
  const entityPaths = new Map<string, Array<Array<string | number>>>();

  for (const [sceneIndex, scene] of world.scenes.entries()) {
    addPath(scenePaths, scene.id, ["scenes", sceneIndex, "id"]);
    for (const [entityIndex, entity] of scene.entities.entries()) {
      addPath(entityPaths, entity.id, ["scenes", sceneIndex, "entities", entityIndex, "id"]);
    }
  }

  for (const [id, paths] of scenePaths) {
    if (paths.length > 1) {
      issues.push(identityIssue("identity.duplicate_scene_id", `Duplicate scene ID ${id} appears at ${paths.map(pathText).join(", ")}.`, paths[0] ?? []));
    }
  }

  for (const [id, paths] of entityPaths) {
    if (paths.length > 1) {
      issues.push(identityIssue("identity.duplicate_entity_id", `Duplicate entity ID ${id} appears at ${paths.map(pathText).join(", ")}.`, paths[0] ?? []));
    }
  }

  for (const [id, sceneIdPaths] of scenePaths) {
    const entityIdPaths = entityPaths.get(id);
    if (entityIdPaths) {
      issues.push(
        identityIssue(
          "identity.scene_entity_id_collision",
          `ID ${id} is used by both a scene and an entity; scene/entity IDs must be globally unique.`,
          sceneIdPaths[0] ?? [],
        ),
      );
    }
  }

  return issues;
}

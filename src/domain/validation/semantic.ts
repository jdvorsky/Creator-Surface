import { contentTypeRegistry, isSupportedType } from "../contentTypes";
import { buildWorldIndex } from "../indexing";
import type { ValidationIssue, WorldDocument, WorldIndex } from "../model";
import { SUPPORTED_ENTITY_TYPES } from "../model";
import { stableIssues } from "./shared";

export function validateCommittedWorld(world: WorldDocument): ValidationIssue[] {
  const index = buildWorldIndex(world);
  const issues: ValidationIssue[] = [];

  for (const [sceneIndex, scene] of world.scenes.entries()) {
    if (scene.name.trim().length === 0) {
      issues.push({
        id: `metadata.scene_empty_name:${scene.id}`,
        severity: "warning",
        category: "metadata",
        code: "metadata.scene_empty_name",
        message: `Scene ${scene.id} has an empty name; add a readable scene name.`,
        path: ["scenes", sceneIndex, "name"],
        sceneId: scene.id,
        blocking: false,
      });
    }

    for (const [entityIndex, entity] of scene.entities.entries()) {
      const basePath = ["scenes", sceneIndex, "entities", entityIndex] as Array<string | number>;
      if (entity.name.trim().length === 0) {
        issues.push({
          id: `metadata.entity_empty_name:${entity.id}`,
          severity: "warning",
          category: "metadata",
          code: "metadata.entity_empty_name",
          message: `Entity ${entity.id} has an empty name; add a readable entity name.`,
          path: [...basePath, "name"],
          sceneId: scene.id,
          entityId: entity.id,
          blocking: false,
        });
      }

      if (entity.position.x < 0 || entity.position.y < 0 || entity.position.x > scene.bounds.width || entity.position.y > scene.bounds.height) {
        issues.push({
          id: `spatial.position_out_of_bounds:${entity.id}`,
          severity: "warning",
          category: "spatial",
          code: "spatial.position_out_of_bounds",
          message: `Entity ${entity.id} is at (${entity.position.x}, ${entity.position.y}), outside scene ${scene.id} bounds 0..${scene.bounds.width} by 0..${scene.bounds.height}.`,
          path: [...basePath, "position"],
          sceneId: scene.id,
          entityId: entity.id,
          blocking: false,
        });
      }

      if (!isSupportedType(entity.type)) {
        issues.push({
          id: `unsupported.entity_type:${entity.id}:${entity.type}`,
          severity: "error",
          category: "unsupported",
          code: "unsupported.entity_type",
          message: `Entity ${entity.id} uses unsupported type "${entity.type}"; expected ${SUPPORTED_ENTITY_TYPES.join(", ")}. It is shown with a fallback glyph.`,
          path: [...basePath, "type"],
          sceneId: scene.id,
          entityId: entity.id,
          blocking: false,
        });
        continue;
      }

      issues.push(...contentTypeRegistry[entity.type].validate(entity, { world, index, scene }));
    }
  }

  return stableIssues(issues);
}

export function issuesForScene(issues: ValidationIssue[], sceneId: string): ValidationIssue[] {
  return issues.filter((issue) => issue.sceneId === sceneId);
}

export function issuesForEntity(issues: ValidationIssue[], entityId: string): ValidationIssue[] {
  return issues.filter((issue) => issue.entityId === entityId);
}

export function mapRepresentability(world: WorldDocument, index: WorldIndex = buildWorldIndex(world)) {
  const issues = validateCommittedWorld(world);
  return world.scenes.flatMap((scene) =>
    scene.entities.map((entity) => {
      const entityIssues = issues.filter((issue) => issue.entityId === entity.id);
      const degraded =
        !isSupportedType(entity.type) ||
        entityIssues.some((issue) => issue.category === "metadata" || issue.category === "reference" || issue.category === "unsupported");
      return {
        sceneId: scene.id,
        entityId: entity.id,
        status: degraded ? "fallback represented" : "fully represented",
        entity,
        index,
      };
    }),
  );
}

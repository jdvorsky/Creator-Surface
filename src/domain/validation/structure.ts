import type { EntityDocument, JsonObject, SceneDocument, ValidationIssue, WorldDocument } from "../model";
import { isFiniteNumber, isPositiveFinite, isRecord, pushStructureIssue, startsWithPath, pathText } from "./shared";

export function coerceWorld(value: unknown, issues: ValidationIssue[]): WorldDocument | null {
  if (!isRecord(value)) {
    pushStructureIssue(issues, [], "structure.world_object", "World document must be a JSON object.");
    return null;
  }

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== 1) {
    pushStructureIssue(issues, ["schemaVersion"], "structure.invalid_schema_version", "World schemaVersion must be 1.");
  }
  const id = expectString(value, "id", ["id"], "world", issues);
  const name = expectString(value, "name", ["name"], "world", issues);
  if (!Array.isArray(value.scenes)) {
    pushStructureIssue(issues, ["scenes"], "structure.world_scenes", "World scenes must be an array.");
  }
  const metadata = optionalJsonObject(value.metadata, ["metadata"], "World metadata", issues);
  const scenesValue = Array.isArray(value.scenes) ? value.scenes : [];
  const scenes: SceneDocument[] = [];
  for (const [sceneIndex, sceneValue] of scenesValue.entries()) {
    const scene = coerceScene(sceneValue, sceneIndex, issues);
    if (scene) scenes.push(scene);
  }

  if (issues.some((issue) => issue.blocking)) {
    return null;
  }

  return {
    ...(value as JsonObject),
    schemaVersion: 1,
    id: id ?? "",
    name: name ?? "",
    scenes,
    ...(metadata === undefined ? {} : { metadata }),
  } as WorldDocument;
}

function coerceScene(value: unknown, sceneIndex: number, issues: ValidationIssue[]): SceneDocument | null {
  const path = ["scenes", sceneIndex] as Array<string | number>;
  if (!isRecord(value)) {
    pushStructureIssue(issues, path, "structure.scene_object", `Scene at ${pathText(path)} must be an object.`);
    return null;
  }
  const id = expectString(value, "id", [...path, "id"], "scene", issues);
  const name = expectString(value, "name", [...path, "name"], `scene ${id ?? sceneIndex}`, issues);
  const bounds = coerceBounds(value.bounds, [...path, "bounds"], id ?? String(sceneIndex), issues);
  if (!Array.isArray(value.entities)) {
    pushStructureIssue(issues, [...path, "entities"], "structure.scene_entities", `Scene ${id ?? sceneIndex} entities must be an array.`);
  }
  const metadata = optionalJsonObject(value.metadata, [...path, "metadata"], `Scene ${id ?? sceneIndex} metadata`, issues);
  const entityValues = Array.isArray(value.entities) ? value.entities : [];
  const entities: EntityDocument[] = [];
  for (const [entityIndex, entityValue] of entityValues.entries()) {
    const entity = coerceEntity(entityValue, sceneIndex, entityIndex, issues);
    if (entity) entities.push(entity);
  }

  if (issues.some((issue) => issue.blocking && startsWithPath(issue.path, path))) {
    return null;
  }

  return {
    ...(value as JsonObject),
    id: id ?? "",
    name: name ?? "",
    bounds: bounds ?? { width: 1, height: 1 },
    entities,
    ...(metadata === undefined ? {} : { metadata }),
  } as SceneDocument;
}

function coerceEntity(value: unknown, sceneIndex: number, entityIndex: number, issues: ValidationIssue[]): EntityDocument | null {
  const path = ["scenes", sceneIndex, "entities", entityIndex] as Array<string | number>;
  if (!isRecord(value)) {
    pushStructureIssue(issues, path, "structure.entity_object", `Entity at ${pathText(path)} must be an object.`);
    return null;
  }
  const id = expectString(value, "id", [...path, "id"], "entity", issues);
  const type = expectString(value, "type", [...path, "type"], `entity ${id ?? entityIndex}`, issues);
  const name = expectString(value, "name", [...path, "name"], `entity ${id ?? entityIndex}`, issues);
  const position = coercePosition(value.position, [...path, "position"], id ?? String(entityIndex), issues);
  const data = optionalJsonObject(value.data, [...path, "data"], `Entity ${id ?? entityIndex} data`, issues);
  const metadata = optionalJsonObject(value.metadata, [...path, "metadata"], `Entity ${id ?? entityIndex} metadata`, issues);

  if (issues.some((issue) => issue.blocking && startsWithPath(issue.path, path))) {
    return null;
  }

  return {
    ...(value as JsonObject),
    id: id ?? "",
    type: type ?? "",
    name: name ?? "",
    position: position ?? { x: 0, y: 0 },
    ...(data === undefined ? {} : { data }),
    ...(metadata === undefined ? {} : { metadata }),
  } as EntityDocument;
}

function coerceBounds(value: unknown, path: Array<string | number>, sceneId: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    pushStructureIssue(issues, path, "structure.scene_bounds", `Scene ${sceneId} bounds must contain positive finite width and height.`);
    return null;
  }
  const width = value.width;
  const height = value.height;
  const validWidth = isPositiveFinite(width);
  const validHeight = isPositiveFinite(height);
  if (!validWidth) {
    pushStructureIssue(
      issues,
      [...path, "width"],
      "structure.invalid_scene_bounds",
      `Scene ${sceneId} bounds.width must be a positive finite number.`,
    );
  }
  if (!validHeight) {
    pushStructureIssue(
      issues,
      [...path, "height"],
      "structure.invalid_scene_bounds",
      `Scene ${sceneId} bounds.height must be a positive finite number.`,
    );
  }
  if (!validWidth || !validHeight) {
    return null;
  }
  return { ...(value as JsonObject), width, height };
}

function coercePosition(value: unknown, path: Array<string | number>, entityId: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    pushStructureIssue(
      issues,
      path,
      "structure.invalid_entity_position",
      `Entity ${entityId} position must contain finite numeric x and y values so the map can place it safely.`,
    );
    return null;
  }

  const validX = isFiniteNumber(value.x);
  const validY = isFiniteNumber(value.y);
  if (!validX) {
    pushStructureIssue(
      issues,
      [...path, "x"],
      "structure.invalid_entity_position",
      `Entity ${entityId} position.x must be a finite number so the map can place it safely.`,
    );
  }
  if (!validY) {
    pushStructureIssue(
      issues,
      [...path, "y"],
      "structure.invalid_entity_position",
      `Entity ${entityId} position.y must be a finite number so the map can place it safely.`,
    );
  }
  if (!validX || !validY) {
    return null;
  }

  return { ...(value as JsonObject), x: value.x, y: value.y };
}

function optionalJsonObject(
  value: unknown,
  path: Array<string | number>,
  label: string,
  issues: ValidationIssue[],
): JsonObject | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    pushStructureIssue(issues, path, "structure.object_expected", `${label} must be a JSON object when present.`);
    return undefined;
  }
  return value as JsonObject;
}

function expectString(
  object: Record<string, unknown>,
  key: string,
  path: Array<string | number>,
  context: string,
  issues: ValidationIssue[],
): string | null {
  const value = object[key];
  if (typeof value !== "string") {
    pushStructureIssue(issues, path, "structure.required_string", `${context} requires string field ${key}.`);
    return null;
  }
  if (key === "id" && value.trim().length === 0) {
    pushStructureIssue(issues, path, "identity.empty_id", `${context} requires a non-empty id.`);
  }
  return value;
}

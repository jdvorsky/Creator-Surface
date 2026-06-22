import { z } from "zod";
import type {
  ContentTypeDefinition,
  EntityDocument,
  JsonObject,
  SupportedEntityType,
  ValidationContext,
  ValidationIssue,
} from "./model";
import { SUPPORTED_ENTITY_TYPES } from "./model";

const locationCategories = ["landmark", "building", "natural", "settlement", "interaction", "other"] as const;
const characterRoles = ["merchant", "guide", "enemy", "companion", "guard", "quest-giver", "other"] as const;
const dispositions = ["friendly", "neutral", "hostile"] as const;
const itemCategories = ["key", "map", "weapon", "artifact", "book", "tool", "treasure", "other"] as const;
const rarities = ["common", "uncommon", "rare", "epic", "legendary"] as const;
const activations = ["interact", "touch", "automatic"] as const;

export const supportedTypeSet = new Set<string>(SUPPORTED_ENTITY_TYPES);

export const commonMetadataSchema = z
  .object({
    description: z.string().max(2_000).optional(),
    tags: z
      .array(
        z
          .string()
          .min(1)
          .max(32)
          .refine((tag) => tag === tag.trim(), {
            message: "Tag must not contain leading or trailing whitespace",
          }),
      )
      .max(20)
      .optional(),
  })
  .passthrough();

export const locationMetadataSchema = commonMetadataSchema
  .extend({ region: z.string().min(1).max(80).optional() })
  .passthrough();

export const characterMetadataSchema = commonMetadataSchema
  .extend({ faction: z.string().min(1).max(80).optional() })
  .passthrough();

export const itemMetadataSchema = commonMetadataSchema
  .extend({
    rarity: z.enum(rarities).optional(),
  })
  .passthrough();

export const portalMetadataSchema = commonMetadataSchema
  .extend({ transitionLabel: z.string().min(1).max(120).optional() })
  .passthrough();

export const locationDataSchema = z
  .object({
    category: z.enum(locationCategories).optional(),
    discoveryRadius: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

export const characterDataSchema = z
  .object({
    role: z.enum(characterRoles).optional(),
    disposition: z.enum(dispositions).optional(),
    level: z.number().int().min(1).max(100).optional(),
  })
  .passthrough();

export const itemDataSchema = z
  .object({
    category: z.enum(itemCategories).optional(),
    quantity: z.number().int().min(1).max(9_999).optional(),
    collectible: z.boolean().optional(),
  })
  .passthrough();

export const portalTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scene"), id: z.string().min(1) }).passthrough(),
  z.object({ kind: z.literal("entity"), id: z.string().min(1) }).passthrough(),
]);

export const portalDataSchema = z
  .object({
    target: portalTargetSchema.optional(),
    oneWay: z.boolean().optional(),
    activation: z.enum(activations).optional(),
  })
  .passthrough();

type KnownPath = "data" | "metadata";

function issueForEntity(
  entity: EntityDocument,
  code: string,
  message: string,
  path: Array<string | number>,
  context: ValidationContext,
  severity: "error" | "warning" = "error",
): ValidationIssue {
  return {
    id: `${code}:${entity.id}:${path.join(".")}`,
    severity,
    category: severity === "warning" ? "metadata" : "metadata",
    code,
    message,
    path,
    sceneId: context.scene.id,
    entityId: entity.id,
    blocking: false,
  };
}

function labelFor(entity: EntityDocument): string {
  switch (entity.type) {
    case "location":
      return "Location marker";
    case "character":
      return "Character";
    case "item":
      return "Item";
    case "portal":
      return "Portal";
    default:
      return "Entity";
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function addSchemaIssues(
  entity: EntityDocument,
  object: unknown,
  schema: z.ZodType<unknown>,
  objectPath: KnownPath,
  context: ValidationContext,
  codePrefix: string,
): ValidationIssue[] {
  const parsed = schema.safeParse(object ?? {});
  if (parsed.success) {
    return duplicateTagIssues(entity, object, objectPath, context);
  }

  const issues = parsed.error.issues.map((zodIssue) => {
    const fullPath = [objectPath, ...zodIssue.path];
    const displayPath = fullPath.join(".");
    const received = readPath(object, zodIssue.path);
    const message = `${labelFor(entity)} ${entity.id} has ${displayPath} ${formatValue(
      received,
    )}; ${friendlyExpectedMessage(entity.type, displayPath, zodIssue.message)}.`;
    return issueForEntity(
      entity,
      `${codePrefix}_${pathCode(zodIssue.path)}`,
      message,
      ["scenes", context.world.scenes.indexOf(context.scene), "entities", context.scene.entities.indexOf(entity), ...fullPath],
      context,
    );
  });
  return [...issues, ...duplicateTagIssues(entity, object, objectPath, context)];
}

function duplicateTagIssues(
  entity: EntityDocument,
  object: unknown,
  objectPath: KnownPath,
  context: ValidationContext,
): ValidationIssue[] {
  if (!isRecord(object) || !Array.isArray(object.tags)) {
    return [];
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const tag of object.tags) {
    if (typeof tag !== "string") continue;
    if (seen.has(tag)) duplicates.add(tag);
    seen.add(tag);
  }
  return [...duplicates].map((tag) =>
    issueForEntity(
      entity,
      "metadata.duplicate_tag",
      `${labelFor(entity)} ${entity.id} repeats metadata tag "${tag}"; duplicate tags are allowed but may make filtering ambiguous.`,
      ["scenes", context.world.scenes.indexOf(context.scene), "entities", context.scene.entities.indexOf(entity), objectPath, "tags"],
      context,
      "warning",
    ),
  );
}

function readPath(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const segment of path) {
    if (isRecord(current) || Array.isArray(current)) {
      current = current[segment as keyof typeof current];
    } else {
      return undefined;
    }
  }
  return current;
}

function pathCode(path: Array<string | number>): string {
  return path.length > 0 ? path.map(String).join("_") : "object";
}

function friendlyExpectedMessage(type: string, path: string, fallback: string): string {
  if (path.endsWith("metadata.tags")) return "expected an array of up to 20 trimmed strings";
  if (path.includes("metadata.tags.")) return "expected a trimmed non-empty string up to 32 characters";
  if (path.endsWith("metadata.description")) return "expected a string no longer than 2000 characters";
  if (path.endsWith("data.category") && type === "location") {
    return `expected ${locationCategories.join(", ")}`;
  }
  if (path.endsWith("data.discoveryRadius")) return "expected a finite number greater than or equal to 0";
  if (path.endsWith("data.role")) return `expected ${characterRoles.join(", ")}`;
  if (path.endsWith("data.disposition")) return `expected ${dispositions.join(", ")}`;
  if (path.endsWith("data.level")) return "expected an integer from 1 through 100";
  if (path.endsWith("data.category") && type === "item") return `expected ${itemCategories.join(", ")}`;
  if (path.endsWith("data.quantity")) return "expected an integer from 1 through 9999";
  if (path.endsWith("data.collectible")) return "expected a boolean";
  if (path.endsWith("metadata.rarity")) return `expected ${rarities.join(", ")}`;
  if (path.endsWith("data.target")) return 'expected { "kind": "scene" | "entity", "id": "..." }';
  if (path.endsWith("data.oneWay")) return "expected a boolean";
  if (path.endsWith("data.activation")) return `expected ${activations.join(", ")}`;
  if (path.endsWith("metadata.transitionLabel")) return "expected a non-empty string no longer than 120 characters";
  if (path.endsWith("metadata.region") || path.endsWith("metadata.faction")) {
    return "expected a non-empty string no longer than 80 characters";
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateDataAndMetadata(
  entity: EntityDocument,
  context: ValidationContext,
  dataSchema: z.ZodType<unknown>,
  metadataSchema: z.ZodType<unknown>,
  codePrefix: string,
): ValidationIssue[] {
  return [
    ...addSchemaIssues(entity, entity.data ?? {}, dataSchema, "data", context, codePrefix),
    ...addSchemaIssues(entity, entity.metadata ?? {}, metadataSchema, "metadata", context, codePrefix),
  ];
}

function validatePortal(entity: EntityDocument, context: ValidationContext): ValidationIssue[] {
  const issues = validateDataAndMetadata(entity, context, portalDataSchema, portalMetadataSchema, "metadata.portal");
  const sceneIndex = context.world.scenes.indexOf(context.scene);
  const entityIndex = context.scene.entities.indexOf(entity);
  const target = isRecord(entity.data) ? entity.data.target : undefined;

  if (target === undefined) {
    issues.push({
      id: `reference.portal_missing_target:${entity.id}`,
      severity: "error",
      category: "reference",
      code: "reference.portal_missing_target",
      message: `Portal ${entity.id} has no target; add data.target with kind "scene" or "entity" and an id.`,
      path: ["scenes", sceneIndex, "entities", entityIndex, "data", "target"],
      sceneId: context.scene.id,
      entityId: entity.id,
      blocking: false,
    });
    return issues;
  }

  const targetResult = portalTargetSchema.safeParse(target);
  if (!targetResult.success) {
    issues.push({
      id: `reference.portal_invalid_target:${entity.id}`,
      severity: "error",
      category: "reference",
      code: "reference.portal_invalid_target",
      message: `Portal ${entity.id} has invalid data.target; expected { "kind": "scene" | "entity", "id": "..." }.`,
      path: ["scenes", sceneIndex, "entities", entityIndex, "data", "target"],
      sceneId: context.scene.id,
      entityId: entity.id,
      blocking: false,
    });
    return issues;
  }

  if (targetResult.data.kind === "scene" && !context.index.scenesById.has(targetResult.data.id)) {
    issues.push({
      id: `reference.portal_missing_scene:${entity.id}:${targetResult.data.id}`,
      severity: "error",
      category: "reference",
      code: "reference.portal_missing_scene",
      message: `Portal ${entity.id} targets missing scene ${targetResult.data.id}. Update data.target.id or create that scene.`,
      path: ["scenes", sceneIndex, "entities", entityIndex, "data", "target", "id"],
      sceneId: context.scene.id,
      entityId: entity.id,
      blocking: false,
    });
  }

  if (targetResult.data.kind === "entity" && !context.index.entitiesById.has(targetResult.data.id)) {
    issues.push({
      id: `reference.portal_missing_entity:${entity.id}:${targetResult.data.id}`,
      severity: "error",
      category: "reference",
      code: "reference.portal_missing_entity",
      message: `Portal ${entity.id} targets missing entity ${targetResult.data.id}. Update data.target.id or create that entity.`,
      path: ["scenes", sceneIndex, "entities", entityIndex, "data", "target", "id"],
      sceneId: context.scene.id,
      entityId: entity.id,
      blocking: false,
    });
  }

  if (targetResult.data.kind === "entity" && targetResult.data.id === entity.id) {
    issues.push({
      id: `reference.portal_self_target:${entity.id}`,
      severity: "warning",
      category: "reference",
      code: "reference.portal_self_target",
      message: `Portal ${entity.id} targets itself; this is allowed but may not be useful.`,
      path: ["scenes", sceneIndex, "entities", entityIndex, "data", "target", "id"],
      sceneId: context.scene.id,
      entityId: entity.id,
      blocking: false,
    });
  }

  return issues;
}

export const contentTypeRegistry: Record<SupportedEntityType, ContentTypeDefinition> = {
  location: {
    id: "location",
    label: "Location marker",
    pluralLabel: "Location markers",
    icon: "MapPin",
    mapGlyph: "diamond",
    createData: () => ({ category: "landmark", discoveryRadius: 0 }),
    createMetadata: () => ({ tags: [] }),
    dataSchema: locationDataSchema,
    metadataSchema: locationMetadataSchema,
    validate: (entity, context) =>
      validateDataAndMetadata(entity, context, locationDataSchema, locationMetadataSchema, "metadata.location"),
  },
  character: {
    id: "character",
    label: "Character",
    pluralLabel: "Characters",
    icon: "UserRound",
    mapGlyph: "circle",
    createData: () => ({ role: "other", disposition: "neutral", level: 1 }),
    createMetadata: () => ({ tags: [] }),
    dataSchema: characterDataSchema,
    metadataSchema: characterMetadataSchema,
    validate: (entity, context) =>
      validateDataAndMetadata(entity, context, characterDataSchema, characterMetadataSchema, "metadata.character"),
  },
  item: {
    id: "item",
    label: "Item",
    pluralLabel: "Items",
    icon: "Package",
    mapGlyph: "square",
    createData: () => ({ category: "other", quantity: 1, collectible: true }),
    createMetadata: () => ({ tags: [] }),
    dataSchema: itemDataSchema,
    metadataSchema: itemMetadataSchema,
    validate: (entity, context) =>
      validateDataAndMetadata(entity, context, itemDataSchema, itemMetadataSchema, "metadata.item"),
  },
  portal: {
    id: "portal",
    label: "Portal",
    pluralLabel: "Portals",
    icon: "Waypoints",
    mapGlyph: "ring",
    createData: () => ({ oneWay: false, activation: "interact" }),
    createMetadata: () => ({ tags: [] }),
    dataSchema: portalDataSchema,
    metadataSchema: portalMetadataSchema,
    validate: validatePortal,
  },
};

export function isSupportedType(type: string): type is SupportedEntityType {
  return supportedTypeSet.has(type);
}

export function contentTypeOptions(): ContentTypeDefinition[] {
  return SUPPORTED_ENTITY_TYPES.map((type) => contentTypeRegistry[type]);
}

export function mergeTypeDefaults(type: SupportedEntityType, data: JsonObject | undefined, metadata: JsonObject | undefined) {
  const definition = contentTypeRegistry[type];
  return {
    data: { ...definition.createData(), ...(data ?? {}) },
    metadata: { ...(definition.createMetadata?.() ?? {}), ...(metadata ?? {}) },
  };
}

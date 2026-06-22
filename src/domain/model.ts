import type { ZodType } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface WorldDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  scenes: SceneDocument[];
  metadata?: JsonObject;
}

export interface SceneDocument {
  id: string;
  name: string;
  bounds: {
    width: number;
    height: number;
  };
  entities: EntityDocument[];
  metadata?: JsonObject;
}

export interface EntityDocument {
  id: string;
  type: string;
  name: string;
  position: Position;
  data?: JsonObject;
  metadata?: JsonObject;
}

export interface Position {
  x: number;
  y: number;
}

export type PortalTarget =
  | { kind: "scene"; id: string }
  | { kind: "entity"; id: string };

export const SUPPORTED_ENTITY_TYPES = ["location", "character", "item", "portal"] as const;
export type SupportedEntityType = (typeof SUPPORTED_ENTITY_TYPES)[number];

export type MapGlyphKind = "diamond" | "circle" | "square" | "ring" | "unknown";

export interface WorldIndex {
  scenesById: Map<string, SceneDocument>;
  entitiesById: Map<string, EntityDocument>;
  sceneIdByEntityId: Map<string, string>;
  entityIdsBySceneId: Map<string, string[]>;
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning";
  category:
    | "syntax"
    | "structure"
    | "identity"
    | "reference"
    | "spatial"
    | "metadata"
    | "unsupported";
  code: string;
  message: string;
  path: Array<string | number>;
  sourceRange?: {
    from: number;
    to: number;
  };
  sceneId?: string;
  entityId?: string;
  blocking: boolean;
}

export interface ValidationContext {
  world: WorldDocument;
  index: WorldIndex;
  scene: SceneDocument;
}

export type Selection =
  | { kind: "world" }
  | { kind: "scene"; sceneId: string }
  | { kind: "entity"; sceneId: string; entityId: string };

export type SourceApplyStatus = "synced" | "dirty" | "invalid" | "cannot-apply";

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface ContentTypeDefinition {
  id: SupportedEntityType;
  label: string;
  pluralLabel: string;
  icon: "MapPin" | "UserRound" | "Package" | "Waypoints";
  mapGlyph: MapGlyphKind;
  createData(): JsonObject;
  createMetadata?(): JsonObject;
  dataSchema: ZodType<unknown>;
  metadataSchema: ZodType<unknown>;
  validate(entity: EntityDocument, context: ValidationContext): ValidationIssue[];
}

export type ApplySourceResult =
  | { ok: true; revision: number }
  | {
      ok: false;
      reason: "syntax" | "blocking-issues" | "stale";
      issues: ValidationIssue[];
    };

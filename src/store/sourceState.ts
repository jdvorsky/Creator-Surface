import type { SourceApplyStatus, ValidationIssue, WorldDocument } from "../domain/model";
import { serializeWorld } from "../domain/serialization";
import { parseJsonSource, validateUnknownWorld } from "../domain/validation";

export interface SourceState {
  text: string;
  baseRevision: number;
  status: SourceApplyStatus;
  isStale: boolean;
  syntaxIssues: ValidationIssue[];
  structuralIssues: ValidationIssue[];
}

export function syncOrStaleSource(source: SourceState, world: WorldDocument, revision: number): SourceState {
  if (source.status === "synced" && !source.isStale) {
    return {
      text: serializeWorld(world),
      baseRevision: revision,
      status: "synced",
      isStale: false,
      syntaxIssues: [],
      structuralIssues: [],
    };
  }
  return {
    ...source,
    isStale: true,
  };
}

export function classifySourceDraft(
  source: SourceState,
  world: WorldDocument,
  revision: number,
  text: string,
  options?: { resetStale?: boolean },
): SourceState {
  const committedText = serializeWorld(world);
  const matchesCommitted = text === committedText;
  const nextBaseRevision = options?.resetStale || matchesCommitted ? revision : source.baseRevision;
  const nextIsStale = matchesCommitted ? false : options?.resetStale ? false : source.isStale;
  const parsed = parseJsonSource(text);

  if (!parsed.ok) {
    const syntaxIssues = parsed.issues.filter((issue) => issue.category === "syntax");
    const structuralIssues = parsed.issues.filter((issue) => issue.category !== "syntax");
    return {
      ...source,
      text,
      baseRevision: nextBaseRevision,
      isStale: nextIsStale,
      status: structuralIssues.length > 0 ? "cannot-apply" : "invalid",
      syntaxIssues,
      structuralIssues,
    };
  }

  const validation = validateUnknownWorld(parsed.value);
  if (!validation.ok) {
    return {
      ...source,
      text,
      baseRevision: nextBaseRevision,
      isStale: nextIsStale,
      status: "cannot-apply",
      syntaxIssues: [],
      structuralIssues: validation.issues,
    };
  }

  return {
    ...source,
    text,
    baseRevision: nextBaseRevision,
    isStale: nextIsStale,
    status: matchesCommitted && !nextIsStale ? "synced" : "dirty",
    syntaxIssues: [],
    structuralIssues: [],
  };
}

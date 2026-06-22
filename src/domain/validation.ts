import type { ValidationIssue, WorldDocument } from "./model";
import { findDuplicateObjectKeyIssues } from "./validation/duplicateKeys";
import { validateIdentity } from "./validation/identity";
import { mapRepresentability, issuesForEntity, issuesForScene, validateCommittedWorld } from "./validation/semantic";
import { coerceWorld } from "./validation/structure";
import { pathText } from "./validation/shared";

export interface ParseWorldResult {
  ok: true;
  world: WorldDocument;
  issues: ValidationIssue[];
  blockingIssues: ValidationIssue[];
}

export interface ParseWorldFailure {
  ok: false;
  issues: ValidationIssue[];
}

export type ValidateParsedWorldResult = ParseWorldResult | ParseWorldFailure;

export function parseJsonSource(text: string): { ok: true; value: unknown } | { ok: false; issues: ValidationIssue[] } {
  try {
    const value = JSON.parse(text) as unknown;
    const duplicateKeyIssues = findDuplicateObjectKeyIssues(text);
    if (duplicateKeyIssues.length > 0) {
      return { ok: false, issues: duplicateKeyIssues };
    }
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof SyntaxError ? error.message : "Unable to parse JSON.";
    const positionMatch = /position (\d+)/i.exec(message);
    const position = positionMatch?.[1] ? Number(positionMatch[1]) : null;
    const location = position === null ? "" : ` at character ${position}`;
    return {
      ok: false,
      issues: [
        {
          id: "syntax.invalid_json",
          severity: "error",
          category: "syntax",
          code: "syntax.invalid_json",
          message: `Invalid JSON${location}: ${message}`,
          path: [],
          ...(position === null ? {} : { sourceRange: { from: position, to: position } }),
          blocking: true,
        },
      ],
    };
  }
}

export function validateUnknownWorld(value: unknown): ValidateParsedWorldResult {
  const structuralIssues: ValidationIssue[] = [];
  const world = coerceWorld(value, structuralIssues);
  if (!world) {
    return { ok: false, issues: structuralIssues };
  }

  const identityIssues = validateIdentity(world);
  const blockingIssues = [...structuralIssues, ...identityIssues].filter((issue) => issue.blocking);
  if (blockingIssues.length > 0) {
    return { ok: false, issues: [...structuralIssues, ...identityIssues] };
  }

  const semanticIssues = validateCommittedWorld(world);
  return {
    ok: true,
    world,
    issues: semanticIssues,
    blockingIssues: [],
  };
}

export { issuesForEntity, issuesForScene, mapRepresentability, pathText, validateCommittedWorld };

import { useMemo } from "react";
import { buildWorldIndex } from "../domain/indexing";
import type { ValidationIssue, WorldIndex } from "../domain/model";
import { useEditorStore } from "./editorStore";

const emptyIssues: ValidationIssue[] = [];

export interface IssueLookup {
  all: ValidationIssue[];
  world: ValidationIssue[];
  bySceneId: Map<string, ValidationIssue[]>;
  bySceneOnlyId: Map<string, ValidationIssue[]>;
  byEntityId: Map<string, ValidationIssue[]>;
  errors: number;
  warnings: number;
}

export function useWorldIndex(): WorldIndex {
  const world = useEditorStore((state) => state.world);
  return useMemo(() => buildWorldIndex(world), [world]);
}

export function useIssueLookup(): IssueLookup {
  const issues = useEditorStore((state) => state.issues);
  return useMemo(() => buildIssueLookup(issues), [issues]);
}

export function useIssueCounts(): { errors: number; warnings: number } {
  const lookup = useIssueLookup();
  return { errors: lookup.errors, warnings: lookup.warnings };
}

export function sceneIssues(lookup: IssueLookup, sceneId: string): ValidationIssue[] {
  return lookup.bySceneId.get(sceneId) ?? emptyIssues;
}

export function sceneOnlyIssues(lookup: IssueLookup, sceneId: string): ValidationIssue[] {
  return lookup.bySceneOnlyId.get(sceneId) ?? emptyIssues;
}

export function entityIssues(lookup: IssueLookup, entityId: string): ValidationIssue[] {
  return lookup.byEntityId.get(entityId) ?? emptyIssues;
}

function buildIssueLookup(issues: ValidationIssue[]): IssueLookup {
  const bySceneId = new Map<string, ValidationIssue[]>();
  const bySceneOnlyId = new Map<string, ValidationIssue[]>();
  const byEntityId = new Map<string, ValidationIssue[]>();
  const world: ValidationIssue[] = [];
  let errors = 0;
  let warnings = 0;

  for (const issue of issues) {
    if (issue.severity === "error") errors += 1;
    if (issue.severity === "warning") warnings += 1;

    if (issue.sceneId) {
      const sceneList = bySceneId.get(issue.sceneId) ?? [];
      sceneList.push(issue);
      bySceneId.set(issue.sceneId, sceneList);

      if (!issue.entityId) {
        const sceneOnlyList = bySceneOnlyId.get(issue.sceneId) ?? [];
        sceneOnlyList.push(issue);
        bySceneOnlyId.set(issue.sceneId, sceneOnlyList);
      }
    }

    if (issue.entityId) {
      const entityList = byEntityId.get(issue.entityId) ?? [];
      entityList.push(issue);
      byEntityId.set(issue.entityId, entityList);
      continue;
    }

    if (!issue.sceneId) {
      world.push(issue);
    }
  }

  return { all: issues, world, bySceneId, bySceneOnlyId, byEntityId, errors, warnings };
}

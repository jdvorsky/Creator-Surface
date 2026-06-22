import { AlertTriangle, CircleAlert, FileCode2 } from "lucide-react";
import type { ValidationIssue, WorldIndex } from "../../domain/model";
import { pathText } from "../../domain/validation";
import { useIssueLookup, useWorldIndex } from "../../store/derived";
import { useEditorStore } from "../../store/editorStore";

export function ProblemsPanel() {
  const index = useWorldIndex();
  const issueLookup = useIssueLookup();
  const source = useEditorStore((state) => state.source);
  const selectScene = useEditorStore((state) => state.selectScene);
  const selectEntity = useEditorStore((state) => state.selectEntity);
  const selectWorld = useEditorStore((state) => state.selectWorld);
  const revealSourcePath = useEditorStore((state) => state.revealSourcePath);
  const focusIssue = useEditorStore((state) => state.focusIssue);
  const issues = issueLookup.all;
  const sourceIssues = [...source.syntaxIssues, ...source.structuralIssues];

  const navigateCommittedIssue = (issue: ValidationIssue) => {
    focusIssue(issue.id);
    revealSourcePath(issue.path, { target: targetForIssue(issue) });
    if (issue.entityId) {
      const sceneId = index.sceneIdByEntityId.get(issue.entityId) ?? issue.sceneId;
      if (sceneId) selectEntity(sceneId, issue.entityId);
      return;
    }
    if (issue.sceneId) {
      selectScene(issue.sceneId);
      return;
    }
    selectWorld();
  };

  const navigateSourceIssue = (issue: ValidationIssue) => {
    focusIssue(issue.id);
    revealSourcePath(
      issue.path,
      issue.sourceRange ? { target: targetForIssue(issue), sourceRange: issue.sourceRange } : { target: targetForIssue(issue) },
    );
    if (issue.entityId) {
      const sceneId = index.sceneIdByEntityId.get(issue.entityId) ?? issue.sceneId;
      if (sceneId) selectEntity(sceneId, issue.entityId);
      return;
    }
    if (issue.sceneId) selectScene(issue.sceneId);
  };

  if (issues.length === 0 && sourceIssues.length === 0) {
    return (
      <div className="empty-state">
        <h3>No problems</h3>
        <p>The committed world and source draft have no current diagnostics.</p>
      </div>
    );
  }

  return (
    <div className="problems-panel">
      {sourceIssues.length > 0 ? (
        <section className="problem-group">
          <h3>
            <FileCode2 size={16} aria-hidden="true" />
            Source draft
          </h3>
          {sourceIssues.map((issue) => (
            <button type="button" className={`problem-row problem-${issue.severity}`} key={issue.id} onClick={() => navigateSourceIssue(issue)}>
              <IssueIcon issue={issue} />
              <span>
                <strong>{issue.code}</strong>
                <small>{pathText(issue.path)}</small>
                {issue.message}
              </span>
            </button>
          ))}
        </section>
      ) : null}
      {(["error", "warning"] as const).map((severity) => {
        const severityIssues = issues.filter((issue) => issue.severity === severity);
        if (severityIssues.length === 0) return null;
        return (
          <section className="problem-group" key={severity}>
            <h3>
              {severity === "error" ? <CircleAlert size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
              {severity === "error" ? "Errors" : "Warnings"} ({severityIssues.length})
            </h3>
            {groupByScene(severityIssues).map((group) => (
              <div className="problem-scene-group" key={group.sceneId}>
                <h4>{sceneName(group.sceneId, index)}</h4>
                {group.issues.map((issue) => (
                  <button type="button" className={`problem-row problem-${issue.severity}`} key={issue.id} onClick={() => navigateCommittedIssue(issue)}>
                    <IssueIcon issue={issue} />
                    <span>
                      <strong>{issue.code}</strong>
                      <small>{pathText(issue.path)}</small>
                      {issue.message}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function IssueIcon({ issue }: { issue: ValidationIssue }) {
  return issue.severity === "error" ? <CircleAlert size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />;
}

function groupByScene(issues: ValidationIssue[]): Array<{ sceneId: string; issues: ValidationIssue[] }> {
  const groups = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const sceneId = issue.sceneId ?? "world";
    groups.set(sceneId, [...(groups.get(sceneId) ?? []), issue]);
  }
  return [...groups.entries()].map(([sceneId, groupedIssues]) => ({ sceneId, issues: groupedIssues }));
}

function sceneName(sceneId: string, index: WorldIndex) {
  if (sceneId === "world") return "World";
  const scene = index.scenesById.get(sceneId);
  return scene ? `${scene.name} (${scene.id})` : sceneId;
}

function targetForIssue(issue: ValidationIssue) {
  if (issue.entityId) return { kind: "entity", entityId: issue.entityId } as const;
  if (issue.sceneId) return { kind: "scene", sceneId: issue.sceneId } as const;
  return { kind: "world" } as const;
}

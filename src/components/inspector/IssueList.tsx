import { useEffect, useRef } from "react";
import type { ValidationIssue } from "../../domain/model";
import { useEditorStore } from "../../store/editorStore";

export function IssueList({
  title,
  issues,
  focusedIssueId,
}: {
  title: string;
  issues: ValidationIssue[];
  focusedIssueId: string | null;
}) {
  const focusIssue = useEditorStore((state) => state.focusIssue);
  const revealSourcePath = useEditorStore((state) => state.revealSourcePath);
  const focusedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const node = focusedRef.current;
    if (!node) return;
    if (typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "center" });
    }
    node.focus({ preventScroll: true });
  }, [focusedIssueId]);

  if (issues.length === 0) return null;

  return (
    <div className="entity-issues">
      <h4>{title}</h4>
      {issues.map((issue) => (
        <button
          type="button"
          key={issue.id}
          ref={issue.id === focusedIssueId ? focusedRef : null}
          className={
            issue.id === focusedIssueId
              ? `problem-mini problem-${issue.severity} problem-mini-focused`
              : `problem-mini problem-${issue.severity}`
          }
          aria-current={issue.id === focusedIssueId ? "true" : undefined}
          onClick={() => {
            focusIssue(issue.id);
            revealSourcePath(
              issue.path,
              issue.sourceRange ? { target: targetForIssue(issue), sourceRange: issue.sourceRange } : { target: targetForIssue(issue) },
            );
          }}
        >
          {issue.message}
        </button>
      ))}
    </div>
  );
}

function targetForIssue(issue: ValidationIssue) {
  if (issue.entityId) return { kind: "entity", entityId: issue.entityId } as const;
  if (issue.sceneId) return { kind: "scene", sceneId: issue.sceneId } as const;
  return { kind: "world" } as const;
}

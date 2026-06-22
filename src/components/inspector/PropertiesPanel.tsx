import { entityIssues, sceneOnlyIssues, useIssueLookup, useWorldIndex } from "../../store/derived";
import { useEditorStore } from "../../store/editorStore";
import { EntityInspector } from "./EntityInspector";
import { SceneSummary } from "./SceneSummary";
import { WorldSummary } from "./WorldSummary";

export function PropertiesPanel() {
  const selection = useEditorStore((state) => state.selection);
  const focusedIssue = useEditorStore((state) => state.focusedIssue);
  const index = useWorldIndex();
  const issueLookup = useIssueLookup();
  const focusedIssueId = focusedIssue?.issueId ?? null;

  if (selection.kind === "world") {
    return <WorldSummary issues={issueLookup.world} focusedIssueId={focusedIssueId} />;
  }

  if (selection.kind === "scene") {
    return (
      <SceneSummary
        sceneId={selection.sceneId}
        issues={sceneOnlyIssues(issueLookup, selection.sceneId)}
        focusedIssueId={focusedIssueId}
      />
    );
  }

  const entity = index.entitiesById.get(selection.entityId);
  if (!entity) {
    return (
      <div className="empty-state">
        <h3>Selection removed</h3>
        <p>The selected entity no longer exists in the committed world.</p>
      </div>
    );
  }

  return (
    <EntityInspector
      entity={entity}
      issues={entityIssues(issueLookup, entity.id)}
      focusedIssueId={focusedIssueId}
    />
  );
}

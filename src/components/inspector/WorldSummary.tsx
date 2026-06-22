import type { ValidationIssue } from "../../domain/model";
import { useEditorStore } from "../../store/editorStore";
import { IssueList } from "./IssueList";
import { SummaryMetric } from "./SummaryMetric";

export function WorldSummary({
  issues,
  focusedIssueId,
}: {
  issues: ValidationIssue[];
  focusedIssueId: string | null;
}) {
  const world = useEditorStore((state) => state.world);
  const entityCount = world.scenes.reduce((sum, scene) => sum + scene.entities.length, 0);
  return (
    <div className="inspector">
      <div className="inspector-heading">
        <div>
          <h3>{world.name}</h3>
          <p>{world.id}</p>
        </div>
      </div>
      <div className="summary-grid">
        <SummaryMetric label="Schema" value={world.schemaVersion} />
        <SummaryMetric label="Scenes" value={world.scenes.length} />
        <SummaryMetric label="Entities" value={entityCount} />
      </div>
      <IssueList title="World issues" issues={issues} focusedIssueId={focusedIssueId} />
      <p className="quiet-note">World-level authored details are editable in Source JSON.</p>
    </div>
  );
}

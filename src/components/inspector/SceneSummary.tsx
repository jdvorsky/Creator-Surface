import { CopyPlus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useConfirmDialog } from "../common/ConfirmDialog";
import { contentTypeOptions, isSupportedType } from "../../domain/contentTypes";
import type { ValidationIssue } from "../../domain/model";
import { useEditorStore } from "../../store/editorStore";
import { IssueList } from "./IssueList";
import { SummaryMetric } from "./SummaryMetric";

export function SceneSummary({
  sceneId,
  issues,
  focusedIssueId,
}: {
  sceneId: string;
  issues: ValidationIssue[];
  focusedIssueId: string | null;
}) {
  const world = useEditorStore((state) => state.world);
  const renameScene = useEditorStore((state) => state.renameScene);
  const setSceneBounds = useEditorStore((state) => state.setSceneBounds);
  const deleteScene = useEditorStore((state) => state.deleteScene);
  const duplicateScene = useEditorStore((state) => state.duplicateScene);
  const scene = world.scenes.find((candidate) => candidate.id === sceneId);
  const { confirm, dialog } = useConfirmDialog();
  const boundsErrorId = useId();
  const [nameDraft, setNameDraft] = useState(scene?.name ?? "");
  const [widthDraft, setWidthDraft] = useState(String(scene?.bounds.width ?? ""));
  const [heightDraft, setHeightDraft] = useState(String(scene?.bounds.height ?? ""));
  const [boundsError, setBoundsError] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(scene?.name ?? "");
    setWidthDraft(String(scene?.bounds.width ?? ""));
    setHeightDraft(String(scene?.bounds.height ?? ""));
    setBoundsError(null);
  }, [sceneId, scene?.name, scene?.bounds.width, scene?.bounds.height]);

  if (!scene) return null;

  const commitName = () => {
    renameScene(scene.id, nameDraft);
  };

  const commitBounds = () => {
    const width = Number(widthDraft);
    const height = Number(heightDraft);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      setBoundsError("Scene bounds must be positive numeric width and height.");
      return;
    }
    setBoundsError(null);
    setSceneBounds(scene.id, { width, height });
  };

  const counts = contentTypeOptions().map((definition) => ({
    label: definition.pluralLabel,
    count: scene.entities.filter((entity) => entity.type === definition.id).length,
  }));
  const unsupported = scene.entities.filter((entity) => !isSupportedType(entity.type)).length;

  return (
    <div className="inspector">
      <div className="inspector-heading">
        <div>
          <h3>{scene.name}</h3>
          <label className="field">
            <span>Name</span>
            <input
              aria-label="Scene name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitName();
                if (event.key === "Escape") setNameDraft(scene.name);
              }}
            />
          </label>
          <p>{scene.id}</p>
        </div>
        <div className="mini-actions">
          <button type="button" className="icon-button" aria-label={`Duplicate ${scene.name}`} title="Duplicate" onClick={() => duplicateScene(scene.id)}>
            <CopyPlus size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button danger"
            aria-label={`Delete ${scene.name}`}
            title="Delete"
            onClick={() => {
              const entityLabel = scene.entities.length === 1 ? "1 entity" : `${scene.entities.length} entities`;
              void confirm({
                title: `Delete ${scene.name}?`,
                message: `This removes ${scene.name} and ${entityLabel} from the committed world. Undo can restore it while the editor is open.`,
                confirmLabel: "Delete scene",
                destructive: true,
              }).then((confirmed) => {
                if (confirmed) deleteScene(scene.id);
              });
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="summary-grid">
        <label className="field">
          <span>Width</span>
          <input
            aria-label="Scene width"
            aria-describedby={boundsError ? boundsErrorId : undefined}
            aria-invalid={boundsError ? "true" : undefined}
            value={widthDraft}
            inputMode="decimal"
            onChange={(event) => setWidthDraft(event.target.value)}
            onBlur={commitBounds}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitBounds();
              if (event.key === "Escape") setWidthDraft(String(scene.bounds.width));
            }}
          />
        </label>
        <label className="field">
          <span>Height</span>
          <input
            aria-label="Scene height"
            aria-describedby={boundsError ? boundsErrorId : undefined}
            aria-invalid={boundsError ? "true" : undefined}
            value={heightDraft}
            inputMode="decimal"
            onChange={(event) => setHeightDraft(event.target.value)}
            onBlur={commitBounds}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitBounds();
              if (event.key === "Escape") setHeightDraft(String(scene.bounds.height));
            }}
          />
        </label>
      </div>
      {boundsError ? (
        <p id={boundsErrorId} className="inline-error">
          {boundsError}
        </p>
      ) : null}
      <div className="summary-grid">
        <SummaryMetric label="Entities" value={scene.entities.length} />
        <SummaryMetric label="Unsupported" value={unsupported} />
      </div>
      <ul className="plain-list">
        {counts.map((count) => (
          <li key={count.label}>
            <span>{count.label}</span>
            <strong>{count.count}</strong>
          </li>
        ))}
      </ul>
      <IssueList title="Scene issues" issues={issues} focusedIssueId={focusedIssueId} />
      {dialog}
    </div>
  );
}

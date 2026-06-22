import { CopyPlus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useConfirmDialog } from "../common/ConfirmDialog";
import { contentTypeOptions, isSupportedType } from "../../domain/contentTypes";
import type { EntityDocument, ValidationIssue } from "../../domain/model";
import { useWorldIndex } from "../../store/derived";
import { useEditorStore } from "../../store/editorStore";
import { IssueList } from "./IssueList";

export function EntityInspector({
  entity,
  issues,
  focusedIssueId,
}: {
  entity: EntityDocument;
  issues: ValidationIssue[];
  focusedIssueId: string | null;
}) {
  const renameEntity = useEditorStore((state) => state.renameEntity);
  const changeEntityType = useEditorStore((state) => state.changeEntityType);
  const setEntityPosition = useEditorStore((state) => state.setEntityPosition);
  const deleteEntity = useEditorStore((state) => state.deleteEntity);
  const duplicateEntity = useEditorStore((state) => state.duplicateEntity);
  const { confirm, dialog } = useConfirmDialog();
  const positionErrorId = useId();
  const [nameDraft, setNameDraft] = useState(entity.name);
  const [xDraft, setXDraft] = useState(String(entity.position.x));
  const [yDraft, setYDraft] = useState(String(entity.position.y));
  const [positionError, setPositionError] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(entity.name);
    setXDraft(String(entity.position.x));
    setYDraft(String(entity.position.y));
    setPositionError(null);
  }, [entity.id, entity.name, entity.position.x, entity.position.y]);

  const commitName = () => {
    renameEntity(entity.id, nameDraft);
  };

  const commitPosition = () => {
    const x = Number(xDraft);
    const y = Number(yDraft);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setPositionError("Position requires finite numeric X and Y values.");
      return;
    }
    setPositionError(null);
    setEntityPosition(entity.id, { x, y });
  };

  return (
    <div className="inspector">
      <div className="inspector-heading">
        <div>
          <h3>{entity.name || "Unnamed entity"}</h3>
          <p>
            {entity.id} - {entity.type}
          </p>
        </div>
        <div className="mini-actions">
          <button type="button" className="icon-button" aria-label={`Duplicate ${entity.name}`} title="Duplicate" onClick={() => duplicateEntity(entity.id)}>
            <CopyPlus size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button danger"
            aria-label={`Delete ${entity.name}`}
            title="Delete"
            onClick={() => {
              void confirm({
                title: `Delete ${entity.name}?`,
                message: "This removes the entity from the committed world. Undo can restore it while the editor is open.",
                confirmLabel: "Delete entity",
                destructive: true,
              }).then((confirmed) => {
                if (confirmed) deleteEntity(entity.id);
              });
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <label className="field">
        <span>Name</span>
        <input
          aria-label="Entity name"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitName();
            if (event.key === "Escape") setNameDraft(entity.name);
          }}
        />
      </label>
      <label className="field">
        <span>Type</span>
        <select
          aria-label="Entity type"
          value={entity.type}
          onChange={(event) => changeEntityType(entity.id, event.target.value)}
        >
          {!isSupportedType(entity.type) ? <option value={entity.type}>{entity.type} (unsupported)</option> : null}
          {contentTypeOptions().map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field-grid">
        <label className="field">
          <span>X position</span>
          <input
            aria-label="X position"
            aria-describedby={positionError ? positionErrorId : undefined}
            aria-invalid={positionError ? "true" : undefined}
            value={xDraft}
            inputMode="decimal"
            onChange={(event) => setXDraft(event.target.value)}
            onBlur={commitPosition}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitPosition();
              if (event.key === "Escape") setXDraft(String(entity.position.x));
            }}
          />
        </label>
        <label className="field">
          <span>Y position</span>
          <input
            aria-label="Y position"
            aria-describedby={positionError ? positionErrorId : undefined}
            aria-invalid={positionError ? "true" : undefined}
            value={yDraft}
            inputMode="decimal"
            onChange={(event) => setYDraft(event.target.value)}
            onBlur={commitPosition}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitPosition();
              if (event.key === "Escape") setYDraft(String(entity.position.y));
            }}
          />
        </label>
      </div>
      {positionError ? (
        <p id={positionErrorId} className="inline-error">
          {positionError}
        </p>
      ) : null}

      <div className="read-only-block">
        <span>Parent scene</span>
        <SceneNameForEntity entityId={entity.id} />
      </div>
      {issues.length > 0 ? (
        <IssueList title="Entity issues" issues={issues} focusedIssueId={focusedIssueId} />
      ) : (
        <p className="quiet-note">Rich data and metadata stay in Source JSON.</p>
      )}
      {dialog}
    </div>
  );
}

function SceneNameForEntity({ entityId }: { entityId: string }) {
  const index = useWorldIndex();
  const sceneId = index.sceneIdByEntityId.get(entityId);
  const scene = sceneId ? index.scenesById.get(sceneId) : null;
  return <strong>{scene ? `${scene.name} (${scene.id})` : "Unknown scene"}</strong>;
}

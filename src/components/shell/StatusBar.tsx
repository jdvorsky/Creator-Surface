import { selectedSceneId } from "../../domain/selection";
import { useIssueLookup, useWorldIndex } from "../../store/derived";
import { useEditorStore } from "../../store/editorStore";

export function StatusBar() {
  const world = useEditorStore((state) => state.world);
  const selection = useEditorStore((state) => state.selection);
  const dragPreview = useEditorStore((state) => state.dragPreview);
  const source = useEditorStore((state) => state.source);
  const index = useWorldIndex();
  const issueLookup = useIssueLookup();
  const sceneId = selectedSceneId(selection, world);
  const selectionText =
    selection.kind === "world"
      ? `World ${world.id}`
      : selection.kind === "scene"
        ? `Scene ${selection.sceneId}`
        : `Entity ${selection.entityId}`;
  const entityCount = world.scenes.reduce((sum, scene) => sum + scene.entities.length, 0);
  const selectedEntity = selection.kind === "entity" ? index.entitiesById.get(selection.entityId) : null;

  return (
    <footer className="status-bar">
      <span>{selectionText}</span>
      <span>{sceneId ? `Map scene ${sceneId}` : "No scene"}</span>
      <span>
        {world.scenes.length} scenes · {entityCount} entities
      </span>
      {selectedEntity ? (
        <span>
          x {selectedEntity.position.x}, y {selectedEntity.position.y}
        </span>
      ) : null}
      {dragPreview ? (
        <span>
          dragging {dragPreview.entityId}: {Math.round(dragPreview.current.x)}, {Math.round(dragPreview.current.y)}
        </span>
      ) : null}
      <span>{issueLookup.all.length} committed issues</span>
      <span>
        Source {source.status}
        {source.isStale ? " stale" : ""}
      </span>
    </footer>
  );
}

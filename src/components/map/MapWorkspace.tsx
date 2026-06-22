import { Maximize2, Grid3X3, Hand, MousePointer2, Plus } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useConfirmDialog } from "../common/ConfirmDialog";
import { contentTypeRegistry } from "../../domain/contentTypes";
import type { Position, Selection } from "../../domain/model";
import { selectedSceneId } from "../../domain/selection";
import { useWorldIndex } from "../../store/derived";
import { useEditorStore } from "../../store/editorStore";
import { clientPointToScene } from "./coordinates";
import { EntityGlyph } from "./EntityGlyph";
import { sameScenePortalConnections } from "./portalConnections";
import { useMapCamera } from "./useMapCamera";

export function MapWorkspace() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pointerPosition, setPointerPosition] = useState<Position | null>(null);
  const panStateRef = useRef<{
    pointerId: number;
    lastScenePoint: Position;
  } | null>(null);
  const world = useEditorStore((state) => state.world);
  const selection = useEditorStore((state) => state.selection);
  const dragPreview = useEditorStore((state) => state.dragPreview);
  const placementType = useEditorStore((state) => state.placementType);
  const issues = useEditorStore((state) => state.issues);
  const selectScene = useEditorStore((state) => state.selectScene);
  const selectEntity = useEditorStore((state) => state.selectEntity);
  const revealSourceForSelection = useEditorStore((state) => state.revealSourceForSelection);
  const beginEntityDrag = useEditorStore((state) => state.beginEntityDrag);
  const previewEntityDrag = useEditorStore((state) => state.previewEntityDrag);
  const commitEntityDrag = useEditorStore((state) => state.commitEntityDrag);
  const cancelEntityDrag = useEditorStore((state) => state.cancelEntityDrag);
  const createEntity = useEditorStore((state) => state.createEntity);
  const setEntityPosition = useEditorStore((state) => state.setEntityPosition);
  const deleteEntity = useEditorStore((state) => state.deleteEntity);
  const setPlacementType = useEditorStore((state) => state.setPlacementType);
  const { confirm, dialog } = useConfirmDialog();
  const index = useWorldIndex();
  const sceneId = selectedSceneId(selection, world);
  const scene = sceneId ? index.scenesById.get(sceneId) ?? null : null;
  const { camera, viewBox, resetCamera, panBy, zoomAt } = useMapCamera(scene);

  useEffect(() => {
    if (!dragPreview && !placementType) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancelEntityDrag();
      setPlacementType(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelEntityDrag, dragPreview, placementType, setPlacementType]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !scene) return;

    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const anchor = clientPointToScene(svg, scene, event.clientX, event.clientY, camera);
      zoomAt(anchor, event.deltaY);
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [camera, scene, zoomAt]);

  if (!scene) {
    return (
      <div className="empty-state">
        <h3>No scenes yet</h3>
        <p>Use Add/Place to add a scene, or create one through Source JSON.</p>
      </div>
    );
  }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const point = clientPointToScene(svgRef.current, scene, event.clientX, event.clientY, camera);
    setPointerPosition(point);

    const panState = panStateRef.current;
    if (panState) {
      const deltaX = point.x - panState.lastScenePoint.x;
      const deltaY = point.y - panState.lastScenePoint.y;
      if (deltaX !== 0 || deltaY !== 0) {
        panBy(deltaX, deltaY);
      }
      panStateRef.current = {
        pointerId: event.pointerId,
        lastScenePoint: point,
      };
    }

    if (dragPreview) {
      previewEntityDrag(point);
    }
  };

  const handleMapPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (!svgRef.current) return;
    if (placementType) {
      const point = clientPointToScene(svgRef.current, scene, event.clientX, event.clientY, camera);
      createEntity(scene.id, placementType, point);
      return;
    }

    const point = clientPointToScene(svgRef.current, scene, event.clientX, event.clientY, camera);

    const target = event.target as SVGElement;
    if (target === svgRef.current || target.classList.contains("map-background") || target.classList.contains("map-grid")) {
      panStateRef.current = {
        pointerId: event.pointerId,
        lastScenePoint: point,
      };
      svgRef.current.setPointerCapture(event.pointerId);
    }

    const nextSelection = { kind: "scene", sceneId: scene.id } satisfies Selection;
    selectScene(scene.id);
    revealSourceForSelection(nextSelection);
  };

  const handlePointerUp = () => {
    const panState = panStateRef.current;
    if (panState) {
      panStateRef.current = null;
      if (svgRef.current) {
        try {
          svgRef.current.releasePointerCapture(panState.pointerId);
        } catch {
          // Ignore release attempts when the pointer was not captured.
        }
      }
      return;
    }
    commitEntityDrag();
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      cancelEntityDrag();
      setPlacementType(null);
    }
  };

  return (
    <div className="map-workspace">
      <div className="map-toolbar" aria-label="Map controls">
        <span className="map-chip">
          <MousePointer2 size={14} aria-hidden="true" />
          {placementType ? `Place ${contentTypeRegistry[placementType].label}` : scene.name}
        </span>
        <span className="map-chip">
          <Grid3X3 size={14} aria-hidden="true" />
          {Math.round(camera.zoom * 100)}% - {scene.bounds.width} x {scene.bounds.height}
        </span>
        {placementType ? null : (
          <span className="map-chip map-chip-hint">
            <Hand size={14} aria-hidden="true" />
            Left-click and drag to pan
          </span>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Fit scene"
          title="Fit scene"
          onClick={resetCamera}
        >
          <Maximize2 size={15} aria-hidden="true" />
        </button>
        {placementType ? (
          <span className="map-chip map-chip-accent">
            <Plus size={14} aria-hidden="true" />
            Click map to create
          </span>
        ) : null}
      </div>
      <svg
        ref={svgRef}
        className="scene-svg"
        role="application"
        tabIndex={0}
        aria-label={`${scene.name} spatial map`}
        viewBox={viewBox}
        preserveAspectRatio="none"
        onPointerDown={handleMapPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          panStateRef.current = null;
        }}
        onPointerCancel={(event) => {
          const panState = panStateRef.current;
          panStateRef.current = null;
          if (svgRef.current) {
            try {
              svgRef.current.releasePointerCapture(panState?.pointerId ?? event.pointerId);
            } catch {
              // Ignore release attempts when the pointer was not captured.
            }
          }
          cancelEntityDrag();
        }}
        onKeyDown={handleKeyDown}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" className="grid-line" />
          </pattern>
        </defs>
        <rect className="map-background" width={scene.bounds.width} height={scene.bounds.height} />
        <rect className="map-grid" width={scene.bounds.width} height={scene.bounds.height} fill="url(#grid)" />
        {sameScenePortalConnections(scene, index).map((connection) => (
          <line
            key={`${connection.from.id}:${connection.to.id}`}
            className="portal-link"
            x1={connection.from.position.x}
            y1={connection.from.position.y}
            x2={connection.to.position.x}
            y2={connection.to.position.y}
          />
        ))}
        {scene.entities.map((entity) => {
          const previewPosition = dragPreview?.entityId === entity.id ? dragPreview.current : entity.position;
          return (
            <EntityGlyph
              key={entity.id}
              entity={entity}
              position={previewPosition}
              selected={selection.kind === "entity" && selection.entityId === entity.id}
              warning={issues.some((issue) => issue.entityId === entity.id)}
              onPointerDown={(event) => {
                if (event.button !== 0 || event.isPrimary === false) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                const nextSelection = { kind: "entity", sceneId: scene.id, entityId: entity.id } satisfies Selection;
                selectEntity(scene.id, entity.id);
                revealSourceForSelection(nextSelection);
                beginEntityDrag(entity.id);
              }}
              onClick={(event) => {
                event.stopPropagation();
                const nextSelection = { kind: "entity", sceneId: scene.id, entityId: entity.id } satisfies Selection;
                selectEntity(scene.id, entity.id);
                revealSourceForSelection(nextSelection);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  const nextSelection = { kind: "entity", sceneId: scene.id, entityId: entity.id } satisfies Selection;
                  selectEntity(scene.id, entity.id);
                  revealSourceForSelection(nextSelection);
                }
                if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
                  event.preventDefault();
                  const step = event.shiftKey ? 24 : 1;
                  const next = nudge(entity.position, event.key, step);
                  setEntityPosition(entity.id, next);
                }
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault();
                  void confirm({
                    title: `Delete ${entity.name}?`,
                    message: "This removes the entity from the committed world. Undo can restore it while the editor is open.",
                    confirmLabel: "Delete entity",
                    destructive: true,
                  }).then((confirmed) => {
                    if (confirmed) deleteEntity(entity.id);
                  });
                }
              }}
            />
          );
        })}
      </svg>
      <div className="map-readout" aria-live="off">
        {pointerPosition ? `Pointer ${Math.round(pointerPosition.x)}, ${Math.round(pointerPosition.y)}` : "Pointer outside map"}
        {dragPreview ? ` - Dragging ${dragPreview.entityId}` : ""}
      </div>
      {dialog}
    </div>
  );
}

function nudge(position: Position, key: string, step: number): Position {
  if (key === "ArrowUp") return { x: position.x, y: position.y - step };
  if (key === "ArrowDown") return { x: position.x, y: position.y + step };
  if (key === "ArrowLeft") return { x: position.x - step, y: position.y };
  return { x: position.x + step, y: position.y };
}

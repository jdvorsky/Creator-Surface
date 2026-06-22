import { useCallback, useMemo } from "react";
import type { CameraState, Position, SceneDocument } from "../../domain/model";
import { useEditorStore } from "../../store/editorStore";

export const defaultCamera: CameraState = { x: 0, y: 0, zoom: 1 };

const minZoom = 0.5;
const maxZoom = 4;

export function useMapCamera(scene: SceneDocument | null) {
  const camerasBySceneId = useEditorStore((state) => state.camerasBySceneId);
  const setSceneCamera = useEditorStore((state) => state.setSceneCamera);
  const camera = scene ? camerasBySceneId[scene.id] ?? defaultCamera : defaultCamera;
  const viewBox = useMemo(() => (scene ? cameraViewBox(scene, camera) : "0 0 1 1"), [camera, scene]);

  const resetCamera = useCallback(() => {
    if (scene) setSceneCamera(scene.id, defaultCamera);
  }, [scene, setSceneCamera]);

  const panBy = useCallback(
    (deltaX: number, deltaY: number) => {
      if (scene) setSceneCamera(scene.id, panCamera(scene, camera, deltaX, deltaY));
    },
    [camera, scene, setSceneCamera],
  );

  const zoomAt = useCallback(
    (anchor: Position, deltaY: number) => {
      if (scene) setSceneCamera(scene.id, zoomCamera(scene, camera, anchor, deltaY));
    },
    [camera, scene, setSceneCamera],
  );

  return { camera, viewBox, resetCamera, panBy, zoomAt };
}

function cameraViewBox(scene: SceneDocument, camera: CameraState): string {
  const fitted = clampCamera(scene, camera);
  return `${fitted.x} ${fitted.y} ${scene.bounds.width / fitted.zoom} ${scene.bounds.height / fitted.zoom}`;
}

function panCamera(scene: SceneDocument, camera: CameraState, deltaX: number, deltaY: number): CameraState {
  return clampCamera(scene, {
    ...camera,
    x: camera.x - deltaX,
    y: camera.y - deltaY,
  });
}

function zoomCamera(scene: SceneDocument, camera: CameraState, anchor: Position, deltaY: number): CameraState {
  const current = clampCamera(scene, camera);
  const nextZoom = clamp(current.zoom * (deltaY < 0 ? 1.16 : 1 / 1.16), minZoom, maxZoom);
  const currentWidth = scene.bounds.width / current.zoom;
  const currentHeight = scene.bounds.height / current.zoom;
  const nextWidth = scene.bounds.width / nextZoom;
  const nextHeight = scene.bounds.height / nextZoom;
  const nextCamera = {
    x: anchor.x - ((anchor.x - current.x) / currentWidth) * nextWidth,
    y: anchor.y - ((anchor.y - current.y) / currentHeight) * nextHeight,
    zoom: nextZoom,
  };
  return clampCamera(scene, nextCamera);
}

function clampCamera(scene: SceneDocument, camera: CameraState): CameraState {
  const zoom = clamp(camera.zoom, minZoom, maxZoom);
  const viewWidth = scene.bounds.width / zoom;
  const viewHeight = scene.bounds.height / zoom;
  return {
    x: clampOffset(camera.x, scene.bounds.width, viewWidth),
    y: clampOffset(camera.y, scene.bounds.height, viewHeight),
    zoom,
  };
}

function clampOffset(offset: number, sceneSize: number, viewSize: number): number {
  if (viewSize >= sceneSize) return (sceneSize - viewSize) / 2;
  return clamp(offset, 0, sceneSize - viewSize);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

import type { CameraState, Position, SceneDocument } from "../../domain/model";

export function clientPointToScene(
  svg: SVGSVGElement,
  scene: SceneDocument,
  clientX: number,
  clientY: number,
  camera: CameraState = { x: 0, y: 0, zoom: 1 },
): Position {
  const rect = svg.getBoundingClientRect();
  const width = rect.width || scene.bounds.width;
  const height = rect.height || scene.bounds.height;
  const viewWidth = scene.bounds.width / camera.zoom;
  const viewHeight = scene.bounds.height / camera.zoom;
  return {
    x: camera.x + ((clientX - rect.left) / width) * viewWidth,
    y: camera.y + ((clientY - rect.top) / height) * viewHeight,
  };
}

export function clampMapLabelX(x: number, scene: SceneDocument): number {
  return Math.max(12, Math.min(scene.bounds.width - 12, x));
}

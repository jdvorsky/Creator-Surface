import type { WorldDocument } from "./model";

export function serializeWorld(world: WorldDocument): string {
  return `${JSON.stringify(world, null, 2)}\n`;
}

export function sameSerializedWorld(left: WorldDocument, right: WorldDocument): boolean {
  return serializeWorld(left) === serializeWorld(right);
}

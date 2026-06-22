import type { WorldIndex } from "./model";

export function slugifyIdPart(value: string): string {
  const trimmed = value.trim();
  const slug = trimmed
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  if (slug) return slug;
  return trimmed ? `entity_${shortHash(trimmed)}` : "entity";
}

export function createReadableEntityId(type: string, name: string, index: WorldIndex): string {
  const base = `${slugifyIdPart(type)}_${slugifyIdPart(name)}`;
  if (!index.entitiesById.has(base) && !index.scenesById.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!index.entitiesById.has(candidate) && !index.scenesById.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a collision-free entity id.");
}

export function createReadableSceneId(name: string, index: WorldIndex): string {
  const base = `scene_${slugifyIdPart(name)}`;
  if (!index.scenesById.has(base) && !index.entitiesById.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!index.scenesById.has(candidate) && !index.entitiesById.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a collision-free scene id.");
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

import { parser } from "@lezer/json";

export interface SourceRange {
  from: number;
  to: number;
}

export type SourcePath = Array<string | number>;

export type SourceNavigationTarget =
  | { kind: "world" }
  | { kind: "scene"; sceneId: string }
  | { kind: "entity"; entityId: string };

interface JsonSyntaxNode {
  name: string;
  from: number;
  to: number;
  firstChild: JsonSyntaxNode | null;
  nextSibling: JsonSyntaxNode | null;
}

interface SourceIndex {
  text: string;
  parsed: unknown;
  rootValue: JsonSyntaxNode;
}

const valueNodeNames = new Set(["Object", "Array", "String", "Number", "True", "False", "Null"]);
let cachedSourceIndex: SourceIndex | null = null;

export function locateJsonPath(text: string, path: SourcePath): SourceRange | null {
  const index = sourceIndexFor(text);
  return index ? locateValueNode(text, index.rootValue, path, 0) : null;
}

export function locateNearestJsonPath(text: string, path: SourcePath): SourceRange | null {
  for (let length = path.length; length >= 0; length -= 1) {
    const range = locateJsonPath(text, path.slice(0, length));
    if (range) return range;
  }
  return null;
}

export function sourcePathForTarget(text: string, target: SourceNavigationTarget): SourcePath | null {
  if (target.kind === "world") return [];

  const sourceIndex = sourceIndexFor(text);
  const parsed = sourceIndex?.parsed;

  if (!isRecord(parsed) || !Array.isArray(parsed.scenes)) return null;

  for (const [sceneIndex, sceneValue] of parsed.scenes.entries()) {
    if (!isRecord(sceneValue)) continue;
    if (target.kind === "scene" && sceneValue.id === target.sceneId) return ["scenes", sceneIndex];
    if (target.kind === "entity" && Array.isArray(sceneValue.entities)) {
      for (const [entityIndex, entityValue] of sceneValue.entities.entries()) {
        if (isRecord(entityValue) && entityValue.id === target.entityId) {
          return ["scenes", sceneIndex, "entities", entityIndex];
        }
      }
    }
  }

  return null;
}

function sourceIndexFor(text: string): SourceIndex | null {
  if (cachedSourceIndex?.text === text) return cachedSourceIndex;

  try {
    const parsed = JSON.parse(text) as unknown;
    const topNode = parser.parse(text).topNode as JsonSyntaxNode;
    const rootValue = firstValueChild(topNode);
    if (!rootValue) return null;
    cachedSourceIndex = { text, parsed, rootValue };
    return cachedSourceIndex;
  } catch {
    if (cachedSourceIndex?.text !== text) cachedSourceIndex = null;
    return null;
  }
}

function locateValueNode(
  text: string,
  node: JsonSyntaxNode,
  path: SourcePath,
  depth: number,
): SourceRange | null {
  if (depth >= path.length) return { from: node.from, to: node.to };

  const segment = path[depth];
  if (typeof segment === "string") {
    if (node.name !== "Object") return null;
    const property = objectPropertyForKey(text, node, segment);
    const value = property ? propertyValueNode(property) : null;
    return value ? locateValueNode(text, value, path, depth + 1) : null;
  }

  if (typeof segment === "number") {
    if (node.name !== "Array" || segment < 0) return null;
    const value = arrayValueAt(node, segment);
    return value ? locateValueNode(text, value, path, depth + 1) : null;
  }

  return null;
}

function objectPropertyForKey(text: string, objectNode: JsonSyntaxNode, key: string): JsonSyntaxNode | null {
  for (let child = objectNode.firstChild; child; child = child.nextSibling) {
    if (child.name !== "Property") continue;
    const propertyName = childByName(child, "PropertyName");
    if (!propertyName) continue;
    try {
      if (JSON.parse(text.slice(propertyName.from, propertyName.to)) === key) {
        return child;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function propertyValueNode(propertyNode: JsonSyntaxNode): JsonSyntaxNode | null {
  for (let child = propertyNode.firstChild; child; child = child.nextSibling) {
    if (valueNodeNames.has(child.name)) return child;
  }
  return null;
}

function arrayValueAt(arrayNode: JsonSyntaxNode, targetIndex: number): JsonSyntaxNode | null {
  let index = 0;
  for (let child = arrayNode.firstChild; child; child = child.nextSibling) {
    if (!valueNodeNames.has(child.name)) continue;
    if (index === targetIndex) return child;
    index += 1;
  }
  return null;
}

function firstValueChild(node: JsonSyntaxNode): JsonSyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (valueNodeNames.has(child.name)) return child;
  }
  return null;
}

function childByName(node: JsonSyntaxNode, name: string): JsonSyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

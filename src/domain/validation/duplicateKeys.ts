import { parser } from "@lezer/json";
import type { ValidationIssue } from "../model";
import { pathText } from "./shared";

interface JsonSyntaxNode {
  name: string;
  from: number;
  to: number;
  firstChild: JsonSyntaxNode | null;
  nextSibling: JsonSyntaxNode | null;
}

interface SourceKeyRecord {
  path: Array<string | number>;
  from: number;
  to: number;
}

const jsonValueNodeNames = new Set(["Object", "Array", "String", "Number", "True", "False", "Null"]);

export function findDuplicateObjectKeyIssues(text: string): ValidationIssue[] {
  try {
    const root = firstJsonValue(parser.parse(text).topNode as JsonSyntaxNode);
    return root ? duplicateKeyIssuesInValue(text, root, []) : [];
  } catch {
    return [];
  }
}

export function findDuplicateObjectKeyIssue(text: string): ValidationIssue | null {
  return findDuplicateObjectKeyIssues(text)[0] ?? null;
}

function duplicateKeyIssuesInValue(text: string, node: JsonSyntaxNode, path: Array<string | number>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (node.name === "Object") {
    const seen = new Map<string, SourceKeyRecord>();
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name !== "Property") continue;
      const propertyName = childByName(child, "PropertyName");
      const propertyValue = propertyValueNode(child);
      if (!propertyName) continue;
      const key = parsePropertyName(text, propertyName);
      if (key === null) continue;
      const keyPath = [...path, key];
      const previous = seen.get(key);
      if (previous) {
        issues.push(duplicateObjectKeyIssue(key, keyPath, previous, { from: propertyName.from, to: propertyName.to }));
      } else {
        seen.set(key, { path: keyPath, from: propertyName.from, to: propertyName.to });
      }
      if (propertyValue) {
        issues.push(...duplicateKeyIssuesInValue(text, propertyValue, keyPath));
      }
    }
  }

  if (node.name === "Array") {
    let index = 0;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (!jsonValueNodeNames.has(child.name)) continue;
      issues.push(...duplicateKeyIssuesInValue(text, child, [...path, index]));
      index += 1;
    }
  }

  return issues;
}

function duplicateObjectKeyIssue(
  key: string,
  path: Array<string | number>,
  first: SourceKeyRecord,
  duplicate: { from: number; to: number },
): ValidationIssue {
  return {
    id: `structure.duplicate_object_key:${path.join(".")}:${duplicate.from}`,
    severity: "error",
    category: "structure",
    code: "structure.duplicate_object_key",
    message: `Duplicate object key "${key}" at ${pathText(path)} would overwrite the earlier key at ${pathText(first.path)}. Remove one duplicate before applying.`,
    path,
    sourceRange: { from: duplicate.from, to: duplicate.to },
    blocking: true,
  };
}

function firstJsonValue(node: JsonSyntaxNode): JsonSyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (jsonValueNodeNames.has(child.name)) return child;
  }
  return null;
}

function propertyValueNode(propertyNode: JsonSyntaxNode): JsonSyntaxNode | null {
  for (let child = propertyNode.firstChild; child; child = child.nextSibling) {
    if (jsonValueNodeNames.has(child.name)) return child;
  }
  return null;
}

function childByName(node: JsonSyntaxNode, name: string): JsonSyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function parsePropertyName(text: string, node: JsonSyntaxNode): string | null {
  try {
    return JSON.parse(text.slice(node.from, node.to)) as string;
  } catch {
    return null;
  }
}

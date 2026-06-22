import type { ValidationIssue } from "../model";

export function stableIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.sort((left, right) => left.id.localeCompare(right.id));
}

export function identityIssue(code: string, message: string, path: Array<string | number>): ValidationIssue {
  return {
    id: `${code}:${path.join(".")}`,
    severity: "error",
    category: "identity",
    code,
    message,
    path,
    blocking: true,
  };
}

export function pushStructureIssue(
  issues: ValidationIssue[],
  path: Array<string | number>,
  code: string,
  message: string,
): void {
  issues.push({
    id: `${code}:${path.join(".")}`,
    severity: "error",
    category: code.startsWith("identity") ? "identity" : "structure",
    code,
    message: `${message} Path: ${pathText(path)}.`,
    path,
    blocking: true,
  });
}

export function addPath(map: Map<string, Array<Array<string | number>>>, id: string, path: Array<string | number>) {
  const existing = map.get(id) ?? [];
  existing.push(path);
  map.set(id, existing);
}

export function pathText(path: Array<string | number>): string {
  return path.length === 0
    ? "$"
    : `$${path
        .map((part) => (typeof part === "number" ? `[${part}]` : `.${part}`))
        .join("")}`;
}

export function startsWithPath(path: Array<string | number>, prefix: Array<string | number>): boolean {
  return prefix.every((part, index) => path[index] === part);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

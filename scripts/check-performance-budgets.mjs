import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * @typedef {{
 *   maxTotalJsGzipBytes: number;
 *   maxTotalCssGzipBytes: number;
 *   maxRawChunkBytes: number;
 *   appShellVisibleMs: number;
 *   defaultSceneSelectableGlyphs: number;
 * }} PerformanceBudgets
 *
 * @typedef {{
 *   file: string;
 *   name: string;
 *   rawBytes: number;
 *   gzipBytes: number;
 * }} BuiltAsset
 */

const root = process.cwd();
const budgetPath = path.join(root, "performance-budgets.json");
const assetsDir = path.join(root, "dist", "assets");

const budgets = parseBudgets(JSON.parse(await readFile(budgetPath, "utf8")));
const files = await listFiles(assetsDir);
/** @type {BuiltAsset[]} */
const assets = await Promise.all(
  files.map(async (file) => {
    const buffer = await readFile(file);
    return {
      file,
      name: path.relative(root, file).replaceAll(path.sep, "/"),
      rawBytes: buffer.byteLength,
      gzipBytes: gzipSync(buffer).byteLength,
    };
  }),
);

const jsAssets = assets.filter((asset) => asset.name.endsWith(".js"));
const cssAssets = assets.filter((asset) => asset.name.endsWith(".css"));
const totalJsGzipBytes = sum(jsAssets.map((asset) => asset.gzipBytes));
const totalCssGzipBytes = sum(cssAssets.map((asset) => asset.gzipBytes));
const oversizedRawAssets = assets.filter((asset) => asset.rawBytes > budgets.maxRawChunkBytes);

const failures = [];
if (totalJsGzipBytes > budgets.maxTotalJsGzipBytes) {
  failures.push(`production JS gzip ${totalJsGzipBytes} B exceeds ${budgets.maxTotalJsGzipBytes} B`);
}
if (totalCssGzipBytes > budgets.maxTotalCssGzipBytes) {
  failures.push(`production CSS gzip ${totalCssGzipBytes} B exceeds ${budgets.maxTotalCssGzipBytes} B`);
}
for (const asset of oversizedRawAssets) {
  failures.push(`${asset.name} raw size ${asset.rawBytes} B exceeds ${budgets.maxRawChunkBytes} B`);
}

if (failures.length > 0) {
  console.error("Performance budgets failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Performance budgets passed: JS gzip ${totalJsGzipBytes} B / ${budgets.maxTotalJsGzipBytes} B, CSS gzip ${totalCssGzipBytes} B / ${budgets.maxTotalCssGzipBytes} B, ${assets.length} built assets checked.`,
);

/**
 * @param {unknown} value
 * @returns {PerformanceBudgets}
 */
function parseBudgets(value) {
  if (!isRecord(value)) {
    throw new Error("performance-budgets.json must contain an object.");
  }
  return {
    maxTotalJsGzipBytes: readFiniteNumber(value.maxTotalJsGzipBytes, "maxTotalJsGzipBytes"),
    maxTotalCssGzipBytes: readFiniteNumber(value.maxTotalCssGzipBytes, "maxTotalCssGzipBytes"),
    maxRawChunkBytes: readFiniteNumber(value.maxRawChunkBytes, "maxRawChunkBytes"),
    appShellVisibleMs: readFiniteNumber(value.appShellVisibleMs, "appShellVisibleMs"),
    defaultSceneSelectableGlyphs: readFiniteNumber(value.defaultSceneSelectableGlyphs, "defaultSceneSelectableGlyphs"),
  };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function readFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`performance-budgets.json field ${name} must be a finite number.`);
  }
  return value;
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(fullPath);
      if (!entry.isFile()) return [];
      const info = await stat(fullPath);
      return info.size > 0 ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

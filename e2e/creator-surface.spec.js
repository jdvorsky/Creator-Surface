import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const browserFailures = new WeakMap();
const performanceBudgets = JSON.parse(readFileSync(new URL("../performance-budgets.json", import.meta.url), "utf8"));

test.beforeEach(({ page }) => {
  watchBrowserFailures(page);
});

test.afterEach(({ page }) => {
  expect(browserFailures.get(page) ?? []).toEqual([]);
});

test("reviewer workflow keeps graph, map, properties, source, and problems synchronized", async ({ context, page }) => {
  await grantClipboard(context, page);
  await page.goto("/");

  await expect(page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ })).toBeVisible();
  await page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ }).click();

  await page.getByRole("button", { name: "Duplicate Harbor District" }).click();
  await expect(page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Delete Harbor District Copy" }).click();
  const deleteCopyDialog = page.getByRole("dialog", { name: "Delete Harbor District Copy?" });
  await expect(deleteCopyDialog).toBeVisible();
  await expect(deleteCopyDialog).toContainText("This removes Harbor District Copy and 5 entities");
  await deleteCopyDialog.getByRole("button", { name: "Delete scene" }).click();
  await expect(page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ })).toHaveCount(0);
  await page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ }).click();

  await page.getByRole("button", { name: /Mira the Cartographer, character/ }).click();
  await expect(page.getByLabel("Entity name")).toHaveValue("Mira the Cartographer");

  await page.getByLabel("Entity name").fill("Mira Demo");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("treeitem", { name: /Mira Demo/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mira Demo, character/ })).toHaveAttribute("aria-pressed", "true");
  expect(findEntity(await copyCommittedWorld(page), "character_mira").name).toBe("Mira Demo");

  const compass = page.getByRole("button", { name: /Sunken Compass, item/ });
  await compass.click();
  const beforeX = await page.getByLabel("X position").inputValue();
  const box = await compass.boundingBox();
  if (!box) throw new Error("Missing compass bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 35, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByLabel("X position")).not.toHaveValue(beforeX);
  expect(findEntity(await copyCommittedWorld(page), "item_sunken_compass").position.x).not.toBe(Number(beforeX));

  await replaceSource(page, (world) => {
    const portal = findEntity(world, "portal_old_gate");
    portal.data = { ...asRecord(portal.data), target: { kind: "scene", id: "scene_missing" } };
  });
  await page.getByRole("button", { name: /^Apply$/ }).click();

  await expect(page.getByRole("treeitem", { name: /Old Gate.*Missing scene: scene_missing/ })).toBeVisible();
  await page.getByRole("tab", { name: /Problems/ }).click();
  await expect(page.getByText(/Portal portal_old_gate targets missing scene scene_missing/)).toBeVisible();

  await replaceSource(page, (world) => {
    const portal = findEntity(world, "portal_old_gate");
    portal.data = { ...asRecord(portal.data), target: { kind: "scene", id: "scene_ruins" } };
  });
  await page.getByRole("button", { name: /^Apply$/ }).click();
  await page.getByRole("tab", { name: /Problems/ }).click();
  await expect(page.getByText(/Portal portal_old_gate targets missing scene scene_missing/)).toHaveCount(0);

  await page.getByRole("button", { name: /Sunken Compass, item/ }).click();
  await replaceSource(page, (world) => {
    for (const scene of world.scenes) {
      scene.entities = scene.entities.filter((entity) => entity.id !== "item_sunken_compass");
    }
  });
  await page.getByRole("button", { name: /^Apply$/ }).click();
  await expect(page.getByRole("button", { name: /Sunken Compass, item/ })).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ })).toHaveAttribute("aria-selected", "true");

  const validMapName = page.getByRole("application", { name: /Harbor District spatial map/ });
  await replaceSourceText(page, '{"schemaVersion": 1,');
  await page.getByRole("button", { name: /^Apply$/ }).click();
  await expect(page.getByText("Invalid JSON", { exact: true })).toBeVisible();
  await expect(validMapName).toBeVisible();

  await page.getByRole("button", { name: /Reload from world/ }).click();
  await expect(page.getByText(/Invalid JSON/)).toHaveCount(0);
});

test("browser readiness smoke keeps app shell fast, console clean, and glyphs complete", async ({ page }) => {
  const startedAt = Date.now();
  await page.goto("/");
  await expect(page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ })).toBeVisible({
    timeout: performanceBudgets.appShellVisibleMs,
  });

  expect(Date.now() - startedAt).toBeLessThanOrEqual(performanceBudgets.appShellVisibleMs);
  await expect(page.locator(".entity-glyph")).toHaveCount(performanceBudgets.defaultSceneSelectableGlyphs);
  await expect(page.getByRole("button", { name: "Download diagnostics" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear local data" })).toBeVisible();
});

test("local committed-world persistence restores only after explicit user choice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Mira the Cartographer, character/ }).click();
  await page.getByLabel("Entity name").fill("Mira Local Save");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("treeitem", { name: /Mira Local Save/ })).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Saved local world from/)).toBeVisible();
  await expect(page.getByRole("treeitem", { name: /Mira Local Save/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Use saved world" }).click();
  await expect(page.getByRole("treeitem", { name: /Mira Local Save/ })).toBeVisible();
  await expect(page.getByText(/Saved local world from/)).toHaveCount(0);
});

function watchBrowserFailures(page) {
  const failures = [];
  browserFailures.set(page, failures);
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.message}`);
  });
}

async function grantClipboard(context, page) {
  await page.addInitScript(() => {
    const clipboardState = { text: "" };
    const clipboard = {
      writeText: (text) => {
        clipboardState.text = String(text);
        return Promise.resolve();
      },
      readText: () => Promise.resolve(clipboardState.text),
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => clipboard,
    });
  });
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  } catch {
    // WebKit does not expose Chromium's clipboard-write permission name.
  }
}

async function copyCommittedWorld(page) {
  await page.getByRole("button", { name: "Copy JSON" }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return JSON.parse(text);
}

async function replaceSource(page, mutator) {
  const world = await copyCommittedWorld(page);
  mutator(world);
  await replaceSourceText(page, `${JSON.stringify(world, null, 2)}\n`);
}

async function replaceSourceText(page, text) {
  await page.getByRole("tab", { name: /Source JSON/ }).click();
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(text);
}

function findEntity(world, entityId) {
  for (const scene of world.scenes) {
    const entity = scene.entities.find((candidate) => candidate.id === entityId);
    if (entity) return entity;
  }
  throw new Error(`Missing entity ${entityId}`);
}

function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

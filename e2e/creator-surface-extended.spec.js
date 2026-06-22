import { expect, test } from "@playwright/test";

const browserFailures = new WeakMap();

test.beforeEach(async ({ context, page }) => {
  watchBrowserFailures(page);
  await grantClipboard(context, page);
  await page.goto("/");
  await expect(page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ })).toBeVisible();
});

test.afterEach(({ page }) => {
  expect(browserFailures.get(page) ?? []).toEqual([]);
});

test("stale source conflicts support reload and confirmed apply-anyway", async ({ page }) => {
  await replaceSource(page, (world) => {
    findEntity(world, "character_mira").name = "Draft Mira";
  });
  await expect(page.getByText("Modified", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Mira the Cartographer, character/ }).click();
  await page.getByLabel("Entity name").fill("Visual Mira");
  await page.keyboard.press("Enter");
  await expect(page.locator(".stale-pill")).toHaveText("World changed elsewhere");
  expect(findEntity(await copyCommittedWorld(page), "character_mira").name).toBe("Visual Mira");

  await page.getByRole("button", { name: /Reload from world/ }).click();
  await expect(page.getByText("In sync", { exact: true })).toBeVisible();
  await expect(page.locator(".stale-pill")).toHaveCount(0);
  expect(findEntity(await copyCommittedWorld(page), "character_mira").name).toBe("Visual Mira");

  await replaceSource(page, (world) => {
    findEntity(world, "character_mira").name = "Draft Mira Wins";
  });
  await page.getByRole("button", { name: /Visual Mira, character/ }).click();
  await page.getByLabel("Entity name").fill("Visual Mira Loses");
  await page.keyboard.press("Enter");
  await expect(page.locator(".stale-pill")).toHaveText("World changed elsewhere");

  await page.getByRole("button", { name: /Apply anyway/ }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Replace newer world changes?" });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Apply anyway" }).click();
  await expect(page.getByText("In sync", { exact: true })).toBeVisible();
  expect(findEntity(await copyCommittedWorld(page), "character_mira").name).toBe("Draft Mira Wins");
});

test("blocking source apply preserves the committed world and visible map", async ({ page }) => {
  const before = await copyCommittedWorld(page);
  await replaceSource(page, (world) => {
    findEntity(world, "item_sunken_compass").position = { x: "left", y: 420 };
  });

  await page.getByRole("button", { name: /^Apply$/ }).click();

  await expect(page.getByText("Cannot apply", { exact: true })).toBeVisible();
  await expect(page.getByText(/position\.x must be a finite number/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Sunken Compass, item/ })).toBeVisible();
  expect(findEntity(await copyCommittedWorld(page), "item_sunken_compass").position).toEqual(
    findEntity(before, "item_sunken_compass").position,
  );
});

test("unsupported entity types remain visible, selectable, and navigable from Problems", async ({ page }) => {
  await replaceSource(page, (world) => {
    findEntity(world, "item_sunken_compass").type = "vehicle";
  });
  await page.getByRole("button", { name: /^Apply$/ }).click();

  await expect(page.getByText("Unsupported (1)")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sunken Compass, vehicle/ })).toBeVisible();
  await page.getByRole("button", { name: /Sunken Compass, vehicle/ }).click();
  await expect(page.getByLabel("Entity type")).toHaveValue("vehicle");

  await page.getByRole("tab", { name: /Problems/ }).click();
  await page.getByRole("button", { name: /unsupported\.entity_type.*item_sunken_compass/ }).click();
  await expect(page.getByRole("tab", { name: /Source JSON/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Entity type")).toHaveValue("vehicle");
});

test("portal entity targets cover source-applied cross-scene success and missing-entity failure", async ({ page }) => {
  await replaceSource(page, (world) => {
    findEntity(world, "portal_old_gate").data = {
      ...asRecord(findEntity(world, "portal_old_gate").data),
      target: { kind: "entity", id: "marker_moon_shrine" },
    };
  });
  await page.getByRole("button", { name: /^Apply$/ }).click();

  await expect(page.getByRole("treeitem", { name: /Old Gate.*Entity: Moonlit Ruins \/ Moon Shrine \(marker_moon_shrine\)/ })).toBeVisible();
  await page.getByRole("treeitem", { name: /Moon Shrine marker_moon_shrine/ }).click();
  await expect(page.getByRole("application", { name: /Moonlit Ruins spatial map/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Moon Shrine, location/ })).toHaveAttribute("aria-pressed", "true");

  await replaceSource(page, (world) => {
    findEntity(world, "portal_old_gate").data = {
      ...asRecord(findEntity(world, "portal_old_gate").data),
      target: { kind: "entity", id: "entity_missing" },
    };
  });
  await page.getByRole("button", { name: /^Apply$/ }).click();

  await expect(page.getByRole("treeitem", { name: /Old Gate.*Missing entity: entity_missing/ })).toBeVisible();
  await page.getByRole("tab", { name: /Problems/ }).click();
  await expect(page.getByText(/Portal portal_old_gate targets missing entity entity_missing/)).toBeVisible();
});

test("source editor actually scrolls for graph, map, and problem navigation", async ({ page }) => {
  await page.getByRole("tab", { name: /Source JSON/ }).click();
  await resetSourceScroll(page);
  await page.getByRole("treeitem", { name: /^Moonline Crossing scene_moonline$/ }).click();
  await expectSourceScrollGreaterThan(page, 20);

  await resetSourceScroll(page);
  await page.getByRole("button", { name: /Crossing Token, item/ }).click();
  await expectSourceScrollGreaterThan(page, 20);

  await replaceSource(page, (world) => {
    findEntity(world, "marker_moonline").type = "vehicle";
  });
  await page.getByRole("button", { name: /^Apply$/ }).click();
  await page.getByRole("tab", { name: /Source JSON/ }).click();
  await resetSourceScroll(page);
  await page.getByRole("tab", { name: /Problems/ }).click();
  await page.getByRole("button", { name: /unsupported\.entity_type.*marker_moonline/ }).click();
  await expect(page.getByRole("tab", { name: /Source JSON/ })).toHaveAttribute("aria-selected", "true");
  await expectSourceScrollGreaterThan(page, 20);
});

test("deleting an original scene preserves inbound portal references as actionable issues", async ({ page }) => {
  await page.getByRole("button", { name: "Delete Harbor District" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete Harbor District?" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog).toContainText("This removes Harbor District and 5 entities");
  await deleteDialog.getByRole("button", { name: "Delete scene" }).click();

  await expect(page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ })).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: /^Moonlit Ruins scene_ruins/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /Problems/ }).click();
  await expect(page.getByText(/Portal portal_return_harbor targets missing scene scene_harbor/)).toBeVisible();
  expect((await copyCommittedWorld(page)).scenes.some((scene) => scene.id === "scene_harbor")).toBe(false);
});

test("undo and redo restore scene actions, placement, source apply, and drag projections", async ({ page }) => {
  await page.getByRole("button", { name: "Duplicate Harbor District" }).click();
  await expect(page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ })).toBeVisible();
  await historyButton(page, "Undo").click();
  await expect(page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ })).toHaveCount(0);
  await historyButton(page, "Redo").click();
  await expect(page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ })).toBeVisible();
  await page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ }).click();

  await page.getByRole("button", { name: "Delete Harbor District Copy" }).click();
  await page.getByRole("dialog", { name: "Delete Harbor District Copy?" }).getByRole("button", { name: "Delete scene" }).click();
  await expect(page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ })).toHaveCount(0);
  await historyButton(page, "Undo").click();
  await expect(page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ })).toBeVisible();
  await historyButton(page, "Redo").click();
  await expect(page.getByRole("treeitem", { name: /^Harbor District Copy scene_harbor_district_copy$/ })).toHaveCount(0);

  await page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ }).click();
  await page.getByLabel("Add/Place").selectOption("item");
  await clickMapAt(page, 240, 260);
  await expect(page.getByRole("button", { name: /New Item, item/ })).toBeVisible();
  await historyButton(page, "Undo").click();
  await expect(page.getByRole("button", { name: /New Item, item/ })).toHaveCount(0);
  await historyButton(page, "Redo").click();
  await expect(page.getByRole("button", { name: /New Item, item/ })).toBeVisible();

  await replaceSource(page, (world) => {
    findEntity(world, "character_mira").name = "Source Undo Mira";
  });
  await page.getByRole("button", { name: /^Apply$/ }).click();
  await expect(page.getByRole("treeitem", { name: /Source Undo Mira/ })).toBeVisible();
  await historyButton(page, "Undo").click();
  await expect(page.getByRole("treeitem", { name: /Mira the Cartographer/ })).toBeVisible();
  await historyButton(page, "Redo").click();
  await expect(page.getByRole("treeitem", { name: /Source Undo Mira/ })).toBeVisible();

  const compass = page.getByRole("button", { name: /Sunken Compass, item/ });
  const before = findEntity(await copyCommittedWorld(page), "item_sunken_compass").position;
  await dragBy(page, compass, 56, 28);
  const moved = findEntity(await copyCommittedWorld(page), "item_sunken_compass").position;
  expect(moved).not.toEqual(before);
  await historyButton(page, "Undo").click();
  expect(findEntity(await copyCommittedWorld(page), "item_sunken_compass").position).toEqual(before);
  await historyButton(page, "Redo").click();
  expect(findEntity(await copyCommittedWorld(page), "item_sunken_compass").position).toEqual(moved);
});

test("keyboard access covers map selection, movement, deletion, and escape cancellation", async ({ page }) => {
  const before = findEntity(await copyCommittedWorld(page), "item_sunken_compass").position;
  const compass = page.getByRole("button", { name: /Sunken Compass, item/ });
  await compass.focus();
  expect(await compass.evaluate((node) => document.activeElement === node)).toBe(true);

  await page.keyboard.press("Enter");
  await expect(compass).toHaveAttribute("aria-pressed", "true");
  await compass.focus();
  await page.keyboard.press("ArrowRight");
  expect(findEntity(await copyCommittedWorld(page), "item_sunken_compass").position).toEqual({ x: before.x + 1, y: before.y });

  await page.getByLabel("Add/Place").selectOption("portal");
  await expect(page.getByRole("button", { name: /Cancel place/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Cancel place/ })).toHaveCount(0);

  await compass.focus();
  await page.keyboard.press("Delete");
  const deleteDialog = page.getByRole("dialog", { name: "Delete Sunken Compass?" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Delete entity" }).click();
  await expect(page.getByRole("button", { name: /Sunken Compass, item/ })).toHaveCount(0);
});

test("keyboard focus reaches the primary editor surfaces", async ({ page }) => {
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Add/Place")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "0 errors" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "0 warnings" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Copy JSON" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Download JSON" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Import JSON" })).toBeFocused();
  const selectedSceneTreeItem = page.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ });
  for (let step = 0; step < 4; step += 1) {
    if (await selectedSceneTreeItem.evaluate((node) => document.activeElement === node).catch(() => false)) break;
    await page.keyboard.press("Tab");
  }
  await expect(selectedSceneTreeItem).toBeFocused();

  await page.getByRole("treeitem", { name: /Sunken Compass/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Entity name")).toHaveValue("Sunken Compass");

  const compass = page.getByRole("button", { name: /Sunken Compass, item/ });
  await compass.focus();
  await expect(compass).toBeFocused();

  await page.getByRole("tab", { name: /Problems/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /Problems/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: /Source JSON/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /Source JSON/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /Format/ }).focus();
  await expect(page.getByRole("button", { name: /Format/ })).toBeFocused();
  await page.locator(".cm-content").first().focus();
  await expect(page.locator(".cm-content").first()).toBeFocused();
});

test("map pan, zoom, and an empty added scene stay usable in the browser", async ({ page }) => {
  const map = page.getByRole("application", { name: /Harbor District spatial map/ });
  const box = await map.boundingBox();
  if (!box) throw new Error("Missing map bounding box");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -450);
  await expect(page.getByText(/1[1-9][0-9]% - 1000 x 640/)).toBeVisible();
  const zoomedViewBox = await map.getAttribute("viewBox");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => map.getAttribute("viewBox")).not.toBe(zoomedViewBox);

  await page.getByRole("button", { name: "Fit scene" }).click();
  await expect(map).toHaveAttribute("viewBox", "0 0 1000 640");

  await page.getByLabel("Add/Place").selectOption("scene");
  await expect(page.getByRole("application", { name: /Scene 7 spatial map/ })).toBeVisible();
  await expect(page.locator(".entity-glyph")).toHaveCount(0);
  await expect(page.getByLabel("Scene width")).toHaveValue("1200");
  await expect(page.getByLabel("Scene height")).toHaveValue("800");
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

function historyButton(page, name) {
  return page.getByLabel("History controls").getByRole("button", { name });
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

async function resetSourceScroll(page) {
  await page.locator(".cm-scroller").evaluate((node) => {
    node.scrollTop = 0;
  });
}

async function expectSourceScrollGreaterThan(page, minimum) {
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((node) => node.scrollTop))
    .toBeGreaterThan(minimum);
}

async function clickMapAt(page, offsetX, offsetY) {
  const map = page.getByRole("application", { name: /spatial map/ });
  const box = await map.boundingBox();
  if (!box) throw new Error("Missing map bounding box");
  await page.mouse.click(box.x + offsetX, box.y + offsetY);
}

async function dragBy(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Missing draggable bounding box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 6 });
  await page.mouse.up();
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

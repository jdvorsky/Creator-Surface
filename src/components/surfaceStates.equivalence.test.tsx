import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorShell } from "../app/EditorShell";
import { PropertiesPanel } from "./inspector/PropertiesPanel";
import { MapWorkspace } from "./map/MapWorkspace";
import { ProblemsPanel } from "./problems/ProblemsPanel";
import { SceneGraphPanel } from "./scene-graph/SceneGraphPanel";
import { SourcePanel } from "./source/SourcePanel";
import { TopToolbar } from "./shell/TopToolbar";
import { buildWorldIndex } from "../domain/indexing";
import type { WorldDocument } from "../domain/model";
import { serializeWorld } from "../domain/serialization";
import { validateCommittedWorld } from "../domain/validation";
import { WORLD_STORAGE_KEY, savePersistedWorldSnapshot, saveSourceDraftRecovery } from "../platform/localPersistence";
import { useEditorStore } from "../store/editorStore";

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  vi.restoreAllMocks();
}

function draftFromCurrentWorld(mutator: (world: WorldDocument) => void): string {
  const world = structuredClone(useEditorStore.getState().world);
  mutator(world);
  return serializeWorld(world);
}

function applyDraft(mutator: (world: WorldDocument) => void): void {
  act(() => {
    useEditorStore.getState().setSourceText(draftFromCurrentWorld(mutator));
  });
  act(() => {
    useEditorStore.getState().applySource();
  });
}

function renderSurface() {
  return render(
    <div>
      <SceneGraphPanel />
      <MapWorkspace />
      <PropertiesPanel />
      <ProblemsPanel />
    </div>,
  );
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read blob"));
    reader.readAsText(blob);
  });
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("rendered surface equivalence classes", () => {
  beforeAll(() => {
    if (!Element.prototype.setPointerCapture) {
      Object.defineProperty(Element.prototype, "setPointerCapture", {
        value: () => undefined,
      });
    }
    if (!Element.prototype.releasePointerCapture) {
      Object.defineProperty(Element.prototype, "releasePointerCapture", {
        value: () => undefined,
      });
    }
  });

  beforeEach(() => {
    resetStore();
  });

  it.each([
    {
      name: "missing target",
      mutate: (world: WorldDocument) => {
        const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
        if (!portal) throw new Error("Missing portal_old_gate");
        portal.data = { oneWay: false };
      },
      summary: /Old Gate.*Target not set/,
    },
    {
      name: "invalid target",
      mutate: (world: WorldDocument) => {
        const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
        if (!portal) throw new Error("Missing portal_old_gate");
        portal.data = { target: "scene_ruins" };
      },
      summary: /Old Gate.*Invalid target/,
    },
    {
      name: "missing entity target",
      mutate: (world: WorldDocument) => {
        const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
        if (!portal) throw new Error("Missing portal_old_gate");
        portal.data = { target: { kind: "entity", id: "entity_missing" } };
      },
      summary: /Old Gate.*Missing entity: entity_missing/,
    },
    {
      name: "resolved cross-scene entity target",
      mutate: (world: WorldDocument) => {
        const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
        if (!portal) throw new Error("Missing portal_old_gate");
        portal.data = { target: { kind: "entity", id: "item_vault_key" } };
      },
      summary: /Old Gate.*Entity: Moonlit Ruins \/ Vault Key \(item_vault_key\)/,
    },
  ])("shows portal graph summaries for $name", ({ mutate, summary }) => {
    applyDraft(mutate);
    render(<SceneGraphPanel />);

    expect(screen.getByRole("treeitem", { name: summary })).toBeInTheDocument();
  });

  it("renders unsupported types as selectable fallback content with problem context", async () => {
    const user = userEvent.setup();
    applyDraft((world) => {
      const item = buildWorldIndex(world).entitiesById.get("item_sunken_compass");
      if (!item) throw new Error("Missing item_sunken_compass");
      item.type = "vehicle";
      item.data = { engine: "tidal" };
      item.metadata = { custom: "preserved" };
    });
    renderSurface();

    expect(screen.getByText("Unsupported (1)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Sunken Compass, vehicle/ }));

    expect(screen.getByRole("treeitem", { name: /Sunken Compass/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Entity type")).toHaveValue("vehicle");
    expect(screen.getAllByText(/Entity item_sunken_compass uses unsupported type "vehicle"/)).toHaveLength(2);
  });

  it("marks out-of-bounds entities on the map and in Problems without hiding them", () => {
    applyDraft((world) => {
      const item = buildWorldIndex(world).entitiesById.get("item_sunken_compass");
      if (!item) throw new Error("Missing item_sunken_compass");
      item.position = { x: 1201, y: 420 };
    });
    renderSurface();

    const glyph = screen.getByRole("button", { name: /Sunken Compass, item/ });
    expect(glyph).toHaveClass("entity-warning");
    expect(glyph).toBeInTheDocument();
    expect(screen.getByText("Warnings (1)")).toBeInTheDocument();
    expect(screen.getByText(/Entity item_sunken_compass is at \(1201, 420\), outside scene scene_harbor bounds/)).toBeInTheDocument();
  });

  it("surfaces committed issue counts in toolbar, Problems groups, and graph nodes", () => {
    applyDraft((world) => {
      const item = buildWorldIndex(world).entitiesById.get("item_sunken_compass");
      const character = buildWorldIndex(world).entitiesById.get("character_mira");
      if (!item || !character) throw new Error("Missing issue fixture entities");
      item.type = "vehicle";
      character.position = { x: -4, y: 410 };
    });

    render(
      <div>
        <TopToolbar />
        <SceneGraphPanel />
        <ProblemsPanel />
      </div>,
    );

    expect(screen.getByRole("button", { name: "1 errors" })).toHaveClass("pill-error");
    expect(screen.getByRole("button", { name: "1 warnings" })).toHaveClass("pill-warning");
    expect(screen.getByText("Errors (1)")).toBeInTheDocument();
    expect(screen.getByText("Warnings (1)")).toBeInTheDocument();
    expect(screen.getAllByText("Harbor District (scene_harbor)")).toHaveLength(2);
    expect(screen.getByRole("treeitem", { name: /Sunken Compass.*1/ })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /Mira the Cartographer.*1/ })).toBeInTheDocument();
  });

  it("links scene graph disclosure controls to real branch groups", () => {
    const { container } = render(<SceneGraphPanel />);
    const disclosures = container.querySelectorAll<HTMLButtonElement>("[aria-controls]");

    expect(disclosures.length).toBeGreaterThan(0);
    for (const disclosure of disclosures) {
      expect(disclosure).toHaveAttribute("role", "treeitem");
      const branchId = disclosure.getAttribute("aria-controls");
      expect(branchId).toBeTruthy();
      const branch = branchId ? document.getElementById(branchId) : null;
      expect(branch).toHaveAttribute("role", "group");
    }
  });

  it("supports scene graph keyboard traversal and disclosure toggling", () => {
    const { container } = render(<SceneGraphPanel />);
    const world = screen.getByRole("treeitem", { name: /^Tideglass Archipelago$/ });
    const selectedScene = screen.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ });
    const visibleRows = () => [...container.querySelectorAll<HTMLButtonElement>("button.tree-row")].filter((button) => !button.closest("[hidden]"));
    const visibleTabStops = () => visibleRows().filter((button) => button.tabIndex === 0);

    expect(visibleTabStops()).toEqual([selectedScene]);
    world.focus();
    expect(visibleTabStops()).toEqual([world]);

    fireEvent.keyDown(world, { key: "ArrowDown" });
    expect(screen.getByRole("treeitem", { name: /Collapse Scenes/ })).toHaveFocus();
    expect(visibleTabStops()).toEqual([document.activeElement]);

    fireEvent.keyDown(document.activeElement ?? world, { key: "ArrowRight" });
    const harborDisclosure = screen.getByRole("treeitem", { name: /Collapse Harbor District/ });
    expect(harborDisclosure).toHaveFocus();

    fireEvent.keyDown(harborDisclosure, { key: "ArrowDown" });
    expect(screen.getByRole("treeitem", { name: /^Harbor District scene_harbor$/ })).toHaveFocus();

    const scenesDisclosure = screen.getByRole("treeitem", { name: /Collapse Scenes/ });
    scenesDisclosure.focus();
    fireEvent.keyDown(scenesDisclosure, { key: "ArrowLeft" });
    expect(scenesDisclosure).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(scenesDisclosure, { key: "ArrowRight" });
    expect(scenesDisclosure).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(scenesDisclosure, { key: "End" });
    expect(visibleRows().at(-1)).toHaveFocus();
    expect(visibleTabStops()).toEqual([document.activeElement]);

    fireEvent.keyDown(document.activeElement ?? scenesDisclosure, { key: "Home" });
    expect(world).toHaveFocus();
    expect(visibleTabStops()).toEqual([world]);
  });

  it("exposes bottom dock tabpanel relationships and arrow-key tab switching", () => {
    render(<EditorShell />);
    const sourceTab = screen.getByRole("tab", { name: /Source JSON/ });
    const problemsTab = screen.getByRole("tab", { name: /Problems/ });

    expect(sourceTab).toHaveAttribute("aria-controls", "source-panel");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "source-tab");

    sourceTab.focus();
    fireEvent.keyDown(sourceTab, { key: "ArrowRight" });

    expect(problemsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "problems-tab");
  });

  it("labels resize handles for assistive technology", () => {
    render(<EditorShell />);

    expect(screen.getByLabelText("Resize scene graph and map panels")).toBeInTheDocument();
    expect(screen.getByLabelText("Resize map and properties panels")).toBeInTheDocument();
    expect(screen.getByLabelText("Resize editor and bottom dock")).toBeInTheDocument();
  });

  it("offers saved local worlds as an explicit restore choice on load", async () => {
    const user = userEvent.setup();
    const savedWorld = structuredClone(useEditorStore.getState().world);
    savedWorld.name = "Saved Review World";
    savePersistedWorldSnapshot(savedWorld, 6);

    render(<EditorShell />);

    expect(useEditorStore.getState().world.name).not.toBe("Saved Review World");
    await screen.findByText(/Saved local world from/);
    await user.click(screen.getByRole("button", { name: "Use saved world" }));

    expect(useEditorStore.getState().world.name).toBe("Saved Review World");
    expect(useEditorStore.getState().revision).toBe(6);
    expect(screen.queryByText(/Saved local world from/)).not.toBeInTheDocument();
  });

  it("requires confirmation before resetting local recovery data to the sample world", async () => {
    const user = userEvent.setup();
    const savedWorld = structuredClone(useEditorStore.getState().world);
    savedWorld.name = "Saved Reset World";
    savePersistedWorldSnapshot(savedWorld, 6);

    render(<EditorShell />);

    await screen.findByText(/Saved local world from/);
    await user.click(screen.getByRole("button", { name: "Reset to sample" }));
    let dialog = screen.getByRole("dialog", { name: "Reset to sample world?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).not.toBeNull();
    expect(screen.getByText(/Saved local world from/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset to sample" }));
    dialog = screen.getByRole("dialog", { name: "Reset to sample world?" });
    await user.click(within(dialog).getByRole("button", { name: "Reset to sample" }));

    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(useEditorStore.getState().revision).toBe(0);
    expect(useEditorStore.getState().world.name).toBe("Tideglass Archipelago");
    expect(screen.queryByText(/Saved local world from/)).not.toBeInTheDocument();
  });

  it("offers source draft recovery without applying it to the committed world", async () => {
    const user = userEvent.setup();
    const draft = draftFromCurrentWorld((world) => {
      world.name = "Recovered Draft World";
    });
    saveSourceDraftRecovery(draft, 3);

    render(<EditorShell />);

    await screen.findByText(/Recovered source draft from/);
    await user.click(screen.getByRole("button", { name: "Restore draft" }));

    expect(useEditorStore.getState().world.name).not.toBe("Recovered Draft World");
    expect(useEditorStore.getState().source.text).toBe(draft);
    expect(useEditorStore.getState().source.status).toBe("dirty");
    expect(useEditorStore.getState().source.isStale).toBe(true);
    expect(screen.queryByText(/Recovered source draft from/)).not.toBeInTheDocument();
  });

  it("traps focus, cancels with Escape, and returns focus from confirmation dialogs", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    const deleteButton = screen.getByRole("button", { name: "Delete Harbor District" });
    deleteButton.focus();
    await user.click(deleteButton);

    const dialog = screen.getByRole("dialog", { name: "Delete Harbor District?" });
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });
    const confirmButton = within(dialog).getByRole("button", { name: "Delete scene" });

    await waitFor(() => expect(cancelButton).toHaveFocus());
    const background = document.querySelector("[data-modal-background]");
    expect(background).toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "true");

    document.getElementById("source-tab")?.focus();
    await waitFor(() => expect(cancelButton).toHaveFocus());

    fireEvent.keyDown(cancelButton, { key: "Tab", shiftKey: true });
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(confirmButton, { key: "Tab" });
    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(deleteButton).toHaveFocus());
    expect(background).not.toHaveAttribute("inert");
    expect(background).not.toHaveAttribute("aria-hidden");
    expect(buildWorldIndex(useEditorStore.getState().world).scenesById.has("scene_harbor")).toBe(true);
  });

  it("shows source stale controls and explicit apply-anyway replacement", async () => {
    const user = userEvent.setup();
    const dirtyDraft = draftFromCurrentWorld((world) => {
      const entity = buildWorldIndex(world).entitiesById.get("character_mira");
      if (!entity) throw new Error("Missing character_mira");
      entity.name = "Draft Mira";
    });

    act(() => {
      useEditorStore.getState().setSourceText(dirtyDraft);
      useEditorStore.getState().renameEntity("character_mira", "Visual Mira");
    });

    render(<SourcePanel />);

    expect(screen.getByText("Modified")).toBeInTheDocument();
    expect(screen.getByText("World changed elsewhere")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Apply anyway/ }));
    const dialog = screen.getByRole("dialog", { name: "Replace newer world changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Apply anyway" }));

    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("character_mira")?.name).toBe("Draft Mira");
    expect(useEditorStore.getState().source.status).toBe("synced");
  });

  it.each([
    {
      name: "invalid JSON",
      text: "{",
      statusLabel: "Invalid JSON",
      diagnostic: /Invalid JSON/,
    },
    {
      name: "cannot-apply JSON",
      text: () =>
        draftFromCurrentWorld((world) => {
          const item = buildWorldIndex(world).entitiesById.get("item_sunken_compass");
          if (!item) throw new Error("Missing item_sunken_compass");
          item.position = { x: "left", y: 420 } as never;
        }),
      statusLabel: "Cannot apply",
      diagnostic: /position\.x must be a finite number/,
    },
  ])("keeps stale $name diagnostics visible until Reload from world", async ({ text, statusLabel, diagnostic }) => {
    const user = userEvent.setup();

    act(() => {
      useEditorStore.getState().setSourceText(typeof text === "function" ? text() : text);
      useEditorStore.getState().renameEntity("character_mira", "Visual Stale Change");
    });
    render(<SourcePanel />);

    expect(screen.getByText(statusLabel)).toBeInTheDocument();
    expect(screen.getByText("World changed elsewhere")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(diagnostic);
    await user.click(screen.getByRole("button", { name: /^Apply$/ }));

    expect(screen.getByText("World changed elsewhere")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/World changed elsewhere while this source draft was open/);

    await user.click(screen.getByRole("button", { name: /Reload from world/ }));

    expect(screen.getByText("In sync")).toBeInTheDocument();
    expect(screen.queryByText("World changed elsewhere")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("character_mira")?.name).toBe("Visual Stale Change");
  });

  it("separates source diagnostics from committed-world problems and navigates source issues", async () => {
    const user = userEvent.setup();
    act(() => {
      useEditorStore.getState().setSourceText("{");
    });
    const { rerender } = render(<ProblemsPanel />);

    expect(screen.getByText("Source draft")).toBeInTheDocument();
    expect(screen.getByText("syntax.invalid_json")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /syntax\.invalid_json/ }));
    expect(useEditorStore.getState().activeBottomTab).toBe("source");
    expect(useEditorStore.getState().sourceNavigation).toMatchObject({ path: [] });
    expect(useEditorStore.getState().focusedIssue?.issueId).toBe("syntax.invalid_json");

    applyDraft((world) => {
      const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
      if (!portal) throw new Error("Missing portal_old_gate");
      portal.data = { target: { kind: "scene", id: "scene_missing" } };
    });
    rerender(<ProblemsPanel />);

    expect(screen.queryByText("Source draft")).not.toBeInTheDocument();
    expect(screen.getByText("Errors (1)")).toBeInTheDocument();
    expect(screen.getByText(/Portal portal_old_gate targets missing scene scene_missing/)).toBeInTheDocument();
  });

  it("renders empty world states without stale visual content", () => {
    const emptyWorld: WorldDocument = {
      schemaVersion: 1,
      id: "world_empty",
      name: "Empty World",
      scenes: [],
    };

    act(() => {
      useEditorStore.setState({
        world: emptyWorld,
        selection: { kind: "world" },
        issues: validateCommittedWorld(emptyWorld),
        source: {
          text: serializeWorld(emptyWorld),
          baseRevision: 0,
          status: "synced",
          isStale: false,
          syntaxIssues: [],
          structuralIssues: [],
        },
      });
    });

    renderSurface();

    expect(screen.getByRole("treeitem", { name: /Empty World/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Scenes (0)")).toBeInTheDocument();
    expect(screen.getByText("No scenes yet")).toBeInTheDocument();
    expect(screen.getByText("No problems")).toBeInTheDocument();
    expect(screen.getByText("World-level authored details are editable in Source JSON.")).toBeInTheDocument();
  });

  it("renders an empty scene map without stale entity glyphs", () => {
    const emptySceneWorld: WorldDocument = {
      schemaVersion: 1,
      id: "world_empty_scene",
      name: "Empty Scene World",
      scenes: [
        {
          id: "scene_empty",
          name: "Quiet Test Scene",
          bounds: { width: 400, height: 240 },
          entities: [],
        },
      ],
    };

    act(() => {
      useEditorStore.setState({
        world: emptySceneWorld,
        selection: { kind: "scene", sceneId: "scene_empty" },
        issues: validateCommittedWorld(emptySceneWorld),
        source: {
          text: serializeWorld(emptySceneWorld),
          baseRevision: 0,
          status: "synced",
          isStale: false,
          syntaxIssues: [],
          structuralIssues: [],
        },
      });
    });

    renderSurface();

    expect(screen.getByRole("application", { name: /Quiet Test Scene spatial map/ })).toHaveAttribute("viewBox", "0 0 400 240");
    expect(screen.getByText(/100% - 400 x 240/)).toBeInTheDocument();
    expect(screen.getByLabelText("Scene name")).toHaveValue("Quiet Test Scene");
    expect(screen.queryByRole("button", { name: /, (location|character|item|portal)$/ })).not.toBeInTheDocument();
  });

  it("renders every selectable glyph in a crowded scene", () => {
    act(() => {
      useEditorStore.getState().selectScene("scene_aurora_grotto");
    });
    const { container } = renderSurface();
    const scene = useEditorStore.getState().world.scenes.find((candidate) => candidate.id === "scene_aurora_grotto");
    if (!scene) throw new Error("Missing crowded scene fixture");

    expect(container.querySelectorAll(".entity-glyph")).toHaveLength(scene.entities.length);
    for (const entity of scene.entities) {
      expect(screen.getByRole("button", { name: new RegExp(`${escapeRegExp(entity.name)}, ${escapeRegExp(entity.type)}`) })).toBeInTheDocument();
    }
  });

  it("supports keyboard selection and nudge movement on map glyphs", () => {
    renderSurface();
    const item = screen.getByRole("button", { name: /Sunken Compass, item/ });

    fireEvent.keyDown(item, { key: "Enter" });
    expect(useEditorStore.getState().selection).toEqual({
      kind: "entity",
      sceneId: "scene_harbor",
      entityId: "item_sunken_compass",
    });

    fireEvent.keyDown(item, { key: "ArrowRight" });
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("item_sunken_compass")?.position).toEqual({
      x: 611,
      y: 420,
    });

    fireEvent.keyDown(item, { key: "ArrowDown", shiftKey: true });
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("item_sunken_compass")?.position).toEqual({
      x: 611,
      y: 444,
    });
  });

  it("zooms the map with the wheel and resets with Fit scene", async () => {
    const user = userEvent.setup();
    renderSurface();
    const map = screen.getByRole("application", { name: /Harbor District spatial map/ });

    expect(map).toHaveAttribute("viewBox", "0 0 1000 640");
    fireEvent.wheel(map, { deltaY: -120, clientX: 500, clientY: 320 });

    expect(useEditorStore.getState().camerasBySceneId.scene_harbor?.zoom).toBeGreaterThan(1);
    expect(map.getAttribute("viewBox")).not.toBe("0 0 1000 640");
    expect(screen.getByText(/116% - 1000 x 640/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fit scene" }));
    expect(map).toHaveAttribute("viewBox", "0 0 1000 640");
    expect(useEditorStore.getState().camerasBySceneId.scene_harbor).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("pans the zoomed map by left-dragging the background grid", () => {
    renderSurface();
    const map = screen.getByRole("application", { name: /Harbor District spatial map/ });

    fireEvent.wheel(map, { deltaY: -120, clientX: 500, clientY: 320 });
    const before = useEditorStore.getState().camerasBySceneId.scene_harbor;
    if (!before) throw new Error("Expected zoomed camera");

    fireEvent(map, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 500, clientY: 320 }));
    fireEvent(map, new MouseEvent("pointermove", { bubbles: true, clientX: 450, clientY: 320 }));
    fireEvent(map, new MouseEvent("pointerup", { bubbles: true }));

    const after = useEditorStore.getState().camerasBySceneId.scene_harbor;
    expect(after?.zoom).toBe(before.zoom);
    expect(after?.x).toBeGreaterThan(before.x);
  });

  it("ignores non-left pointer starts on entity glyphs", () => {
    renderSurface();
    const item = screen.getByRole("button", { name: /Sunken Compass, item/ });

    fireEvent(item, new MouseEvent("pointerdown", { bubbles: true, button: 2 }));

    expect(useEditorStore.getState().dragPreview).toBeNull();
    expect(useEditorStore.getState().selection).not.toEqual({
      kind: "entity",
      sceneId: "scene_harbor",
      entityId: "item_sunken_compass",
    });
  });

  it("cancels an interrupted entity drag on pointercancel without committing movement", () => {
    renderSurface();
    const map = screen.getByRole("application", { name: /Harbor District spatial map/ });
    const item = screen.getByRole("button", { name: /Sunken Compass, item/ });
    const before = buildWorldIndex(useEditorStore.getState().world).entitiesById.get("item_sunken_compass")?.position;

    fireEvent(item, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 610, clientY: 420 }));
    expect(useEditorStore.getState().dragPreview).toMatchObject({
      sceneId: "scene_harbor",
      entityId: "item_sunken_compass",
    });

    fireEvent(map, new MouseEvent("pointercancel", { bubbles: true, clientX: 650, clientY: 460 }));

    expect(useEditorStore.getState().dragPreview).toBeNull();
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("item_sunken_compass")?.position).toEqual(before);
  });

  it("cancels placement mode with Escape from the map surface", () => {
    act(() => {
      useEditorStore.getState().setPlacementType("portal");
    });
    renderSurface();
    const map = screen.getByRole("application", { name: /Harbor District spatial map/ });

    expect(map).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(useEditorStore.getState().placementType).toBeNull();
  });

  it("places a new entity when clicking the rendered map background grid", () => {
    act(() => {
      useEditorStore.getState().setPlacementType("item");
    });
    const { container } = renderSurface();
    const grid = container.querySelector(".map-grid");
    if (!(grid instanceof Element)) throw new Error("Missing map grid rect");

    fireEvent(grid, new MouseEvent("pointerdown", { bubbles: true, clientX: 222, clientY: 333 }));

    const state = useEditorStore.getState();
    const created = buildWorldIndex(state.world).entitiesById.get("item_new_item");
    expect(created).toMatchObject({
      id: "item_new_item",
      type: "item",
      name: "New Item",
      position: { x: 222, y: 333 },
      data: { category: "other", quantity: 1, collectible: true },
    });
    expect(state.selection).toEqual({ kind: "entity", sceneId: "scene_harbor", entityId: "item_new_item" });
    expect(state.placementType).toBeNull();
    expect(screen.getByRole("button", { name: /New Item, item/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("draws same-scene portal target decorations without validation noise", () => {
    applyDraft((world) => {
      const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
      if (!portal) throw new Error("Missing portal_old_gate");
      portal.data = {
        ...portal.data,
        target: { kind: "entity", id: "marker_lighthouse" },
      };
    });
    const { container } = renderSurface();

    expect(useEditorStore.getState().issues.filter((issue) => issue.entityId === "portal_old_gate")).toEqual([]);
    expect(container.querySelector(".portal-link")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /Old Gate.*Entity: Harbor District \/ Stormglass Lighthouse \(marker_lighthouse\)/ })).toBeInTheDocument();
  });

  it("adds a scene from the Add/Place dropdown", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <TopToolbar />
        <SceneGraphPanel />
        <PropertiesPanel />
      </div>,
    );

    await user.selectOptions(screen.getByLabelText("Add/Place"), "scene");

    const state = useEditorStore.getState();
    expect(state.world.scenes).toHaveLength(7);
    expect(state.world.scenes.at(-1)).toMatchObject({
      id: "scene_scene_7",
      name: "Scene 7",
      bounds: { width: 1200, height: 800 },
      entities: [],
    });
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_scene_7" });
    expect(screen.getByRole("treeitem", { name: /Scene 7 scene_scene_7/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Scene name")).toHaveValue("Scene 7");
  });

  it("duplicates and deletes the selected scene from Properties", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Duplicate Harbor District" }));

    let state = useEditorStore.getState();
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_harbor_district_copy" });
    expect(screen.getByRole("treeitem", { name: /Harbor District Copy scene_harbor_district_copy/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Scene name")).toHaveValue("Harbor District Copy");

    await user.click(screen.getByRole("button", { name: "Delete Harbor District Copy" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Harbor District Copy?" });
    expect(dialog).toHaveTextContent("This removes Harbor District Copy and 5 entities");
    await user.click(within(dialog).getByRole("button", { name: "Delete scene" }));

    state = useEditorStore.getState();
    expect(buildWorldIndex(state.world).scenesById.has("scene_harbor_district_copy")).toBe(false);
    expect(screen.queryByRole("treeitem", { name: /Harbor District Copy/ })).not.toBeInTheDocument();
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_moonline" });
  });

  it("duplicates and deletes the selected entity from Properties", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: /Sunken Compass, item/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate Sunken Compass" }));

    let state = useEditorStore.getState();
    const copy = buildWorldIndex(state.world).entitiesById.get("item_sunken_compass_copy");
    expect(copy).toMatchObject({
      id: "item_sunken_compass_copy",
      name: "Sunken Compass Copy",
      position: { x: 638, y: 448 },
      data: { category: "artifact", quantity: 1, collectible: true },
    });
    expect(state.selection).toEqual({
      kind: "entity",
      sceneId: "scene_harbor",
      entityId: "item_sunken_compass_copy",
    });
    expect(screen.getByRole("button", { name: /Sunken Compass Copy, item/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Delete Sunken Compass Copy" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Sunken Compass Copy?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete entity" }));

    state = useEditorStore.getState();
    expect(buildWorldIndex(state.world).entitiesById.has("item_sunken_compass_copy")).toBe(false);
    expect(screen.queryByRole("button", { name: /Sunken Compass Copy, item/ })).not.toBeInTheDocument();
    expect(state.selection).toEqual({ kind: "scene", sceneId: "scene_harbor" });
  });

  it("imports JSON as an explicit replacement instead of inheriting a stale source draft", async () => {
    const user = userEvent.setup();
    const importedWorld = structuredClone(useEditorStore.getState().world);
    importedWorld.name = "Imported Review World";

    act(() => {
      useEditorStore.getState().setSourceText(draftFromCurrentWorld((world) => {
        world.name = "Dirty Draft World";
      }));
      useEditorStore.getState().renameScene("scene_harbor", "Visual Harbor");
    });

    expect(useEditorStore.getState().source.isStale).toBe(true);

    const { container } = render(<TopToolbar />);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing import input");

    await user.upload(input, new File([serializeWorld(importedWorld)], "world.json", { type: "application/json" }));

    await waitFor(() => {
      expect(useEditorStore.getState().world.name).toBe("Imported Review World");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Imported JSON into the committed world.");
    expect(useEditorStore.getState().source.isStale).toBe(false);
    expect(useEditorStore.getState().source.status).toBe("synced");
    expect(input.value).toBe("");
  });

  it("downloads the committed world JSON with the world ID as filename and cleans up the object URL", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:creator-surface-world");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickedAnchor = { current: null as HTMLAnchorElement | null };
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchor.current = this;
    });

    render(<TopToolbar />);
    await user.click(screen.getByRole("button", { name: "Download JSON" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    await expect(readBlobText(blob as Blob)).resolves.toBe(useEditorStore.getState().source.text);
    expect(click).toHaveBeenCalledTimes(1);
    expect(clickedAnchor.current).not.toBeNull();
    expect(clickedAnchor.current?.download).toBe(`${useEditorStore.getState().world.id}.json`);
    expect(clickedAnchor.current?.href).toBe("blob:creator-surface-world");
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:creator-surface-world"));
    expect(screen.getByRole("status")).toHaveTextContent("Downloaded committed JSON.");
  });

  it("downloads local diagnostics without embedding world JSON or source text", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:creator-surface-diagnostics");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickedAnchor = { current: null as HTMLAnchorElement | null };
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchor.current = this;
    });

    act(() => {
      useEditorStore.getState().renameEntity("character_mira", "Mira Diagnostics Secret");
    });
    render(<TopToolbar />);
    await user.click(screen.getByRole("button", { name: "Download diagnostics" }));

    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    const diagnostics = JSON.parse(await readBlobText(blob as Blob)) as {
      privacy: Record<string, unknown>;
      telemetry: Array<{ name: string }>;
      commandJournal: Array<{ commandKind: string; affectedCount: number }>;
    };
    expect(clickedAnchor.current?.download).toBe("creator-surface-diagnostics.json");
    expect(diagnostics.privacy).toMatchObject({
      transport: "none",
      includesWorldJson: false,
      includesSourceText: false,
      includesNamesOrMetadata: false,
      includesAuthorIds: false,
    });
    expect(diagnostics.telemetry.map((event) => event.name)).toContain("diagnostics.export");
    expect(diagnostics.commandJournal).toContainEqual(expect.objectContaining({ commandKind: "entity.rename", affectedCount: 1 }));
    expect(JSON.stringify(diagnostics)).not.toContain("character_mira");
    expect(JSON.stringify(diagnostics)).not.toContain("Mira Diagnostics Secret");
    expect(JSON.stringify(diagnostics)).not.toContain("Mira the Cartographer");
    expect(JSON.stringify(diagnostics)).not.toContain('"scenes"');
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:creator-surface-diagnostics"));
    expect(screen.getByRole("status")).toHaveTextContent("Downloaded diagnostics.");
  });

  it("scopes world undo and redo shortcuts outside editable fields", () => {
    render(
      <div>
        <TopToolbar />
        <input aria-label="Scratch field" />
      </div>,
    );

    act(() => {
      useEditorStore.getState().renameEntity("character_mira", "Shortcut Mira");
    });

    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("character_mira")?.name).toBe("Shortcut Mira");

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("character_mira")?.name).toBe("Mira the Cartographer");

    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("character_mira")?.name).toBe("Shortcut Mira");

    screen.getByLabelText("Scratch field").focus();
    fireEvent.keyDown(screen.getByLabelText("Scratch field"), { key: "z", ctrlKey: true });
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("character_mira")?.name).toBe("Shortcut Mira");

    const codeMirror = document.createElement("div");
    codeMirror.className = "cm-editor";
    codeMirror.tabIndex = 0;
    document.body.append(codeMirror);
    codeMirror.focus();
    fireEvent.keyDown(codeMirror, { key: "z", ctrlKey: true });
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("character_mira")?.name).toBe("Shortcut Mira");
    codeMirror.remove();
  });

  it("shows toolbar feedback for clipboard copy and local data clearing", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    stubClipboard(writeText);
    savePersistedWorldSnapshot(useEditorStore.getState().world, 3);
    saveSourceDraftRecovery("draft", 3);

    render(<TopToolbar />);
    await user.click(screen.getByRole("button", { name: "Copy JSON" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(serializeWorld(useEditorStore.getState().world));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Copied committed JSON.");

    await user.click(screen.getByRole("button", { name: "Clear local data" }));

    expect(screen.getByRole("status")).toHaveTextContent("Cleared local browser data.");
    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
  });

  it("shows an inline toolbar error when clipboard copy is unavailable", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<TopToolbar />);
    await user.click(screen.getByRole("button", { name: "Copy JSON" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Copy failed; clipboard is unavailable.");
  });

  it("keeps portal relationship details Source-first while Properties stays minimal", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: /Old Gate, portal/ }));

    expect(screen.getByLabelText("Entity name")).toHaveValue("Old Gate");
    expect(screen.getByLabelText("Entity type")).toHaveValue("portal");
    expect(screen.getByLabelText("X position")).toBeInTheDocument();
    expect(screen.getByLabelText("Y position")).toBeInTheDocument();
    expect(screen.queryByLabelText("Portal activation")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Portal one way")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Portal target kind")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Portal target id")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Portal data JSON")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Portal metadata JSON")).not.toBeInTheDocument();

    act(() => {
      useEditorStore.getState().setSourceText(draftFromCurrentWorld((world) => {
        const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
        if (!portal) throw new Error("Missing portal_old_gate");
        portal.data = {
          ...portal.data,
          target: { kind: "entity", id: "marker_lighthouse", travelCost: 2 },
          activation: "touch",
          unknownRule: "preserved",
        };
        portal.metadata = {
          ...portal.metadata,
          transitionLabel: "Source-owned transition",
          customFlag: true,
        };
      }));
      useEditorStore.getState().applySource();
    });

    const portal = buildWorldIndex(useEditorStore.getState().world).entitiesById.get("portal_old_gate");
    expect(portal?.data).toMatchObject({
      target: { kind: "entity", id: "marker_lighthouse", travelCost: 2 },
      activation: "touch",
      unknownRule: "preserved",
    });
    expect(portal?.metadata).toMatchObject({
      transitionLabel: "Source-owned transition",
      customFlag: true,
    });
    expect(screen.getByRole("treeitem", { name: /Old Gate.*Entity: Harbor District \/ Stormglass Lighthouse/ })).toBeInTheDocument();
  });

  it("renders the no-problems empty state when both source and committed worlds are clean", () => {
    render(<ProblemsPanel />);

    expect(screen.getByText("No problems")).toBeInTheDocument();
    expect(screen.getByText("The committed world and source draft have no current diagnostics.")).toBeInTheDocument();
  });

  it("shows source cannot-apply diagnostics inline", () => {
    act(() => {
      useEditorStore.getState().setSourceText(draftFromCurrentWorld((world) => {
        const item = buildWorldIndex(world).entitiesById.get("item_sunken_compass");
        if (!item) throw new Error("Missing item_sunken_compass");
        item.position = { x: "left", y: 1 } as never;
      }));
    });

    render(<SourcePanel />);
    const alert = screen.getByRole("alert");

    expect(screen.getByText("Cannot apply")).toBeInTheDocument();
    expect(within(alert).getByText(/position\.x must be a finite number/)).toBeInTheDocument();
  });
});

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertiesPanel } from "./inspector/PropertiesPanel";
import { MapWorkspace } from "./map/MapWorkspace";
import { ProblemsPanel } from "./problems/ProblemsPanel";
import { SceneGraphPanel } from "./scene-graph/SceneGraphPanel";
import { buildWorldIndex } from "../domain/indexing";
import type { WorldDocument } from "../domain/model";
import { serializeWorld } from "../domain/serialization";
import { useEditorStore } from "../store/editorStore";

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
}

function renderSynchronizedSurface() {
  return render(
    <div>
      <SceneGraphPanel />
      <MapWorkspace />
      <PropertiesPanel />
      <ProblemsPanel />
    </div>,
  );
}

function sourceDraft(mutator: (world: WorldDocument) => void): string {
  const world = structuredClone(useEditorStore.getState().world);
  mutator(world);
  return serializeWorld(world);
}

describe("synchronized editor views", () => {
  beforeAll(() => {
    if (!Element.prototype.setPointerCapture) {
      Object.defineProperty(Element.prototype, "setPointerCapture", {
        value: () => undefined,
      });
    }
  });

  beforeEach(() => {
    resetStore();
  });

  it("selecting an entity in the graph selects it on the map and in Properties", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    await user.click(screen.getByRole("treeitem", { name: /Sunken Compass/ }));

    expect(screen.getByRole("button", { name: /Sunken Compass, item/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Entity name")).toHaveValue("Sunken Compass");
    expect(screen.getByLabelText("Entity type")).toHaveValue("item");
    expect(screen.getByLabelText("X position")).toHaveValue("610");
    expect(screen.getByLabelText("Y position")).toHaveValue("420");
    expect(useEditorStore.getState().sourceNavigation).toMatchObject({
      path: ["scenes", 0, "entities", 2],
    });
    expect(useEditorStore.getState().activeBottomTab).toBe("source");
  });

  it("selecting an entity on the map updates the graph and Properties", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    await user.click(screen.getByRole("button", { name: /Mira the Cartographer, character/ }));

    expect(screen.getByRole("treeitem", { name: /Mira the Cartographer/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Entity name")).toHaveValue("Mira the Cartographer");
    expect(screen.getByText(/Parent scene/).parentElement).toHaveTextContent("Harbor District (scene_harbor)");
    expect(useEditorStore.getState().sourceNavigation).toMatchObject({
      path: ["scenes", 0, "entities", 1],
    });
  });

  it("selecting a scene in the graph changes the rendered map scene", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    await user.click(screen.getByRole("treeitem", { name: /^Moonlit Ruins scene_ruins$/ }));

    expect(screen.getByRole("application", { name: /Moonlit Ruins spatial map/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vault Key, item/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mira the Cartographer, character/ })).not.toBeInTheDocument();
    expect(useEditorStore.getState().sourceNavigation).toMatchObject({ path: ["scenes", 1] });
  });

  it("editing scene bounds in Properties updates the map and synchronized source", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    expect(screen.getByRole("application", { name: /Harbor District spatial map/ })).toHaveAttribute("viewBox", "0 0 1000 640");
    await user.clear(screen.getByLabelText("Scene width"));
    await user.type(screen.getByLabelText("Scene width"), "1200{Enter}");
    await user.clear(screen.getByLabelText("Scene height"));
    await user.type(screen.getByLabelText("Scene height"), "720{Enter}");

    expect(screen.getByRole("application", { name: /Harbor District spatial map/ })).toHaveAttribute("viewBox", "0 0 1200 720");
    expect(screen.getByText(/100% - 1200 x 720/)).toBeInTheDocument();
    expect(useEditorStore.getState().world.scenes[0]?.bounds).toEqual({ width: 1200, height: 720 });
    expect(useEditorStore.getState().source.text).toContain('"width": 1200');
    expect(useEditorStore.getState().source.text).toContain('"height": 720');
  });

  it("rejects invalid scene bounds from Properties without mutating world or source", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();
    const beforeSource = useEditorStore.getState().source.text;

    await user.clear(screen.getByLabelText("Scene width"));
    await user.type(screen.getByLabelText("Scene width"), "0{Enter}");

    expect(screen.getByText("Scene bounds must be positive numeric width and height.")).toBeInTheDocument();
    expect(screen.getByLabelText("Scene width")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Scene height")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("application", { name: /Harbor District spatial map/ })).toHaveAttribute("viewBox", "0 0 1000 640");
    expect(useEditorStore.getState().world.scenes[0]?.bounds).toEqual({ width: 1000, height: 640 });
    expect(useEditorStore.getState().source.text).toBe(beforeSource);
  });

  it("renaming in Properties updates graph, map label, and synchronized source", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    await user.click(screen.getByRole("button", { name: /Mira the Cartographer, character/ }));
    const nameInput = screen.getByLabelText("Entity name");
    await user.clear(nameInput);
    await user.type(nameInput, "Mira Renamed");

    expect(nameInput).toHaveValue("Mira Renamed");
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("character_mira")?.name).toBe("Mira the Cartographer");
    expect(screen.getByRole("treeitem", { name: /Mira the Cartographer/ })).toBeInTheDocument();

    await user.type(nameInput, "{Enter}");

    expect(screen.getByRole("treeitem", { name: /Mira Renamed/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mira Renamed, character/ })).toHaveAttribute("aria-pressed", "true");
    expect(useEditorStore.getState().source.status).toBe("synced");
    expect(useEditorStore.getState().source.text).toContain('"name": "Mira Renamed"');
  });

  it("editing position in Properties updates every projection", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    await user.click(screen.getByRole("treeitem", { name: /Sunken Compass/ }));
    expect(screen.getByLabelText("Entity type")).toHaveValue("item");
    await user.clear(screen.getByLabelText("X position"));
    await user.type(screen.getByLabelText("X position"), "700{Enter}");

    const item = buildWorldIndex(useEditorStore.getState().world).entitiesById.get("item_sunken_compass");
    expect(item?.position.x).toBe(700);
    expect(screen.getByRole("button", { name: /Sunken Compass, item/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("treeitem", { name: /Sunken Compass/ })).toHaveAttribute("aria-selected", "true");
    expect(useEditorStore.getState().source.text).toContain('"type": "item"');
    expect(useEditorStore.getState().source.text).toContain('"x": 700');
  });

  it("editing type in Properties updates projections and merges new type defaults", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    await user.click(screen.getByRole("treeitem", { name: /Sunken Compass/ }));
    await user.selectOptions(screen.getByLabelText("Entity type"), "portal");

    const entity = buildWorldIndex(useEditorStore.getState().world).entitiesById.get("item_sunken_compass");
    expect(entity).toMatchObject({
      id: "item_sunken_compass",
      type: "portal",
      data: {
        activation: "interact",
        oneWay: false,
        category: "artifact",
        quantity: 1,
        collectible: true,
      },
    });
    expect(screen.getByRole("button", { name: /Sunken Compass, portal/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Portal activation")).not.toBeInTheDocument();
    expect(useEditorStore.getState().source.text).toContain('"type": "portal"');
    expect(useEditorStore.getState().source.text).toContain('"activation": "interact"');
  });

  it("invalid numeric Properties input does not mutate world data", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    await user.click(screen.getByRole("treeitem", { name: /Sunken Compass/ }));
    await user.clear(screen.getByLabelText("X position"));
    await user.type(screen.getByLabelText("X position"), "left{Enter}");

    expect(screen.getByText("Position requires finite numeric X and Y values.")).toBeInTheDocument();
    expect(screen.getByLabelText("X position")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Y position")).toHaveAttribute("aria-invalid", "true");
    expect(buildWorldIndex(useEditorStore.getState().world).entitiesById.get("item_sunken_compass")?.position).toEqual({
      x: 610,
      y: 420,
    });
    expect(useEditorStore.getState().source.text).toContain('"x": 610');
  });

  it("source-applied portal target changes refresh graph summaries and Problems navigation together", async () => {
    const user = userEvent.setup();
    renderSynchronizedSurface();

    const missingSceneDraft = sourceDraft((world) => {
      const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
      if (!portal) throw new Error("Missing portal_old_gate");
      portal.data = { ...portal.data, target: { kind: "scene", id: "scene_missing" } };
    });

    act(() => {
      useEditorStore.getState().setSourceText(missingSceneDraft);
    });

    act(() => {
      useEditorStore.getState().applySource();
    });

    expect(useEditorStore.getState().issues.map((issue) => issue.code)).toContain("reference.portal_missing_scene");
    expect(screen.getByRole("treeitem", { name: /Old Gate.*Missing scene: scene_missing/ })).toBeInTheDocument();
    const problems = screen.getByText("Errors (1)").closest("section");
    if (!problems) throw new Error("Missing committed problems section");
    expect(within(problems).getByText(/Portal portal_old_gate targets missing scene scene_missing/)).toBeInTheDocument();

    await user.click(within(problems).getByRole("button", { name: /reference\.portal_missing_scene/ }));

    expect(screen.getByRole("button", { name: /Old Gate, portal/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Entity name")).toHaveValue("Old Gate");
    const focusedIssueButton = screen
      .getAllByRole("button", { name: /Portal portal_old_gate targets missing scene scene_missing/ })
      .find((button) => button.getAttribute("aria-current") === "true");
    expect(focusedIssueButton).toBeDefined();
    expect(useEditorStore.getState().focusedIssue?.issueId).toContain("reference.portal_missing_scene");
    expect(useEditorStore.getState().sourceNavigation).toMatchObject({
      path: ["scenes", 0, "entities", 3, "data", "target", "id"],
    });
    expect(useEditorStore.getState().activeBottomTab).toBe("source");
  });

  it("source-applied valid portal entity targets update graph summaries without adding rich Properties controls", () => {
    renderSynchronizedSurface();

    act(() => {
      useEditorStore.getState().setSourceText(sourceDraft((world) => {
        const portal = buildWorldIndex(world).entitiesById.get("portal_old_gate");
        if (!portal) throw new Error("Missing portal_old_gate");
        portal.data = { ...portal.data, target: { kind: "entity", id: "marker_moon_shrine" } };
      }));
      useEditorStore.getState().applySource();
    });

    expect(screen.getByRole("treeitem", { name: /Old Gate.*Entity: Moonlit Ruins \/ Moon Shrine/ })).toBeInTheDocument();
    expect(useEditorStore.getState().issues).toEqual([]);
    expect(screen.queryByLabelText("Portal target kind")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Portal target id")).not.toBeInTheDocument();
  });
});

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReactTypes from "react";
import type { WorldDocument } from "../../domain/model";
import { sampleWorld } from "../../domain/sampleWorld";
import { serializeWorld } from "../../domain/serialization";
import { locateNearestJsonPath, sourcePathForTarget } from "../../domain/sourceLocation";
import { useEditorStore } from "../../store/editorStore";
import { SourcePanel } from "./SourcePanel";

const codeMirrorMock = vi.hoisted(() => ({
  dispatch: vi.fn(),
  focus: vi.fn(),
  scrollDOM: null as HTMLDivElement | null,
}));

interface MockDispatchRequest {
  selection: {
    main: {
      from: number;
    };
  };
}

vi.mock("@uiw/react-codemirror", async () => {
  const React = await vi.importActual<typeof ReactTypes>("react");

  type MockCodeMirrorProps = {
    value: string;
    onChange?: (value: string) => void;
    onCreateEditor?: (view: unknown) => void;
    "aria-label"?: string;
  };

  return {
    default: function MockCodeMirror(props: MockCodeMirrorProps) {
      const onCreateEditorRef = React.useRef(props.onCreateEditor);
      React.useEffect(() => {
        const scrollDOM = document.createElement("div");
        codeMirrorMock.scrollDOM = scrollDOM;
        onCreateEditorRef.current?.({
          dispatch: codeMirrorMock.dispatch,
          focus: codeMirrorMock.focus,
          scrollDOM,
          dom: document.createElement("div"),
        });
      }, []);

      return React.createElement("textarea", {
        "aria-label": props["aria-label"] ?? "World JSON source",
        value: props.value,
        onChange: (event: ReactTypes.ChangeEvent<HTMLTextAreaElement>) => props.onChange?.(event.target.value),
      });
    },
  };
});

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  codeMirrorMock.dispatch.mockClear();
  codeMirrorMock.focus.mockClear();
  codeMirrorMock.scrollDOM = null;
}

function draftFromCurrentWorld(mutator: (world: WorldDocument) => void): string {
  const world = structuredClone(useEditorStore.getState().world);
  mutator(world);
  return serializeWorld(world);
}

describe("SourcePanel navigation", () => {
  beforeEach(() => {
    resetStore();
  });

  it("consumes a source-navigation request once so later typing does not reselect the old path", async () => {
    render(<SourcePanel />);

    act(() => {
      useEditorStore.getState().revealSourcePath(["scenes", 0, "entities", 0]);
    });

    await waitFor(() => {
      expect(codeMirrorMock.dispatch).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useEditorStore.getState().setSourceText(draftFromCurrentWorld((world) => {
        world.name = "Draft While Source Is Open";
      }));
    });

    await waitFor(() => {
      expect(screen.getByText("Modified")).toBeInTheDocument();
    });
    expect(codeMirrorMock.dispatch).toHaveBeenCalledTimes(1);

    act(() => {
      useEditorStore.getState().revealSourcePath(["scenes", 1]);
    });

    await waitFor(() => {
      expect(codeMirrorMock.dispatch).toHaveBeenCalledTimes(2);
    });
  });

  it("resolves selection reveal by ID when the editable source draft is reordered", async () => {
    const world = structuredClone(sampleWorld);
    world.scenes.reverse();
    const reorderedDraft = serializeWorld(world);
    const target = { kind: "entity", entityId: "item_sunken_compass" } as const;
    const targetPath = sourcePathForTarget(reorderedDraft, target);
    if (!targetPath) throw new Error("Missing target path");
    const targetRange = locateNearestJsonPath(reorderedDraft, targetPath);
    if (!targetRange) throw new Error("Missing target range");

    render(<SourcePanel />);

    act(() => {
      useEditorStore.getState().setSourceText(reorderedDraft);
      useEditorStore.getState().revealSourceForSelection({
        kind: "entity",
        sceneId: "scene_harbor",
        entityId: "item_sunken_compass",
      });
    });

    await waitFor(() => {
      expect(codeMirrorMock.dispatch).toHaveBeenCalledTimes(1);
    });
    expect(dispatchedFrom(0)).toBe(targetRange.from);
  });

  it("resolves issue reveal to the exact leaf path after ID-based dirty-draft lookup", async () => {
    const world = structuredClone(sampleWorld);
    world.scenes.reverse();
    const reorderedDraft = serializeWorld(world);
    const targetPath = ["scenes", 5, "entities", 3, "data", "target", "id"];
    const targetRange = locateNearestJsonPath(reorderedDraft, targetPath);
    if (!targetRange) throw new Error("Missing target id range");

    render(<SourcePanel />);

    act(() => {
      useEditorStore.getState().setSourceText(reorderedDraft);
      useEditorStore.getState().revealSourcePath(["scenes", 0, "entities", 3, "data", "target", "id"], {
        target: { kind: "entity", entityId: "portal_old_gate" },
      });
    });

    await waitFor(() => {
      expect(codeMirrorMock.dispatch).toHaveBeenCalledTimes(1);
    });
    expect(dispatchedFrom(0)).toBe(targetRange.from);
  });

  it("uses structural source paths instead of root selection for world-target cannot-apply issues", async () => {
    const draft = draftFromCurrentWorld((world) => {
      const harbor = world.scenes[0];
      if (!harbor) throw new Error("Missing harbor scene");
      harbor.bounds.width = 0;
    });
    const targetRange = locateNearestJsonPath(draft, ["scenes", 0, "bounds", "width"]);
    if (!targetRange) throw new Error("Missing bounds width range");

    render(<SourcePanel />);

    act(() => {
      useEditorStore.getState().setSourceText(draft);
      useEditorStore.getState().revealSourcePath(["scenes", 0, "bounds", "width"], {
        target: { kind: "world" },
      });
    });

    await waitFor(() => {
      expect(codeMirrorMock.dispatch).toHaveBeenCalledTimes(1);
    });
    expect(dispatchedFrom(0)).toBe(targetRange.from);
  });

  it("uses parser source ranges for syntax issue navigation", async () => {
    render(<SourcePanel />);

    act(() => {
      useEditorStore.getState().setSourceText("{");
      useEditorStore.getState().revealSourcePath([], { sourceRange: { from: 1, to: 1 } });
    });

    await waitFor(() => {
      expect(codeMirrorMock.dispatch).toHaveBeenCalledTimes(1);
    });
    expect(dispatchedFrom(0)).toBe(1);
  });

  it("formats parseable source text back to the canonical synchronized document", async () => {
    const user = userEvent.setup();

    act(() => {
      useEditorStore.getState().setSourceText(JSON.stringify(sampleWorld));
    });
    render(<SourcePanel />);

    expect(screen.getByText("Modified")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Format/ }));

    await waitFor(() => {
      expect(screen.getByText("In sync")).toBeInTheDocument();
    });
    expect(screen.getByRole("textbox", { name: "World JSON source" })).toHaveValue(serializeWorld(sampleWorld));
  });

  it("does not apply wrapper wheel scrolling when the editor already handled the event", () => {
    const { container } = render(<SourcePanel />);
    const wrap = container.querySelector(".source-editor-wrap");
    if (!(wrap instanceof HTMLElement)) throw new Error("Missing source editor wrapper");
    if (!codeMirrorMock.scrollDOM) throw new Error("Missing mock scroll DOM");
    codeMirrorMock.scrollDOM.scrollTop = 40;

    const event = new WheelEvent("wheel", { deltaY: 80, cancelable: true });
    event.preventDefault();
    wrap.dispatchEvent(event);

    expect(codeMirrorMock.scrollDOM.scrollTop).toBe(40);
  });
});

function dispatchedFrom(callIndex: number): number | undefined {
  const request = codeMirrorMock.dispatch.mock.calls[callIndex]?.[0] as MockDispatchRequest | undefined;
  return request?.selection.main.from;
}

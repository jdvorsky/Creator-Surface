import CodeMirror from "@uiw/react-codemirror";
import { EditorSelection } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { Check, ClipboardCheck, FileCode2, RefreshCcw, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirmDialog } from "../common/ConfirmDialog";
import { locateNearestJsonPath, sourcePathForTarget } from "../../domain/sourceLocation";
import { useEditorStore } from "../../store/editorStore";
import { pathText } from "../../domain/validation";

export function SourcePanel() {
  const editorViewRef = useRef<EditorView | null>(null);
  const [editorReadyVersion, setEditorReadyVersion] = useState(0);
  const sourceEditorWrapRef = useRef<HTMLDivElement | null>(null);
  const sourceTextRef = useRef("");
  const handledNavigationRequestIdRef = useRef<number | null>(null);
  const source = useEditorStore((state) => state.source);
  const sourceNavigation = useEditorStore((state) => state.sourceNavigation);
  const setSourceText = useEditorStore((state) => state.setSourceText);
  const applySource = useEditorStore((state) => state.applySource);
  const reloadSourceFromWorld = useEditorStore((state) => state.reloadSourceFromWorld);
  const formatSource = useEditorStore((state) => state.formatSource);
  const setActiveBottomTab = useEditorStore((state) => state.setActiveBottomTab);
  const { confirm, dialog } = useConfirmDialog();
  const sourceIssues = [...source.syntaxIssues, ...source.structuralIssues];

  useEffect(() => {
    sourceTextRef.current = source.text;
  }, [source.text]);

  useEffect(() => {
    if (!sourceNavigation || !editorViewRef.current) return;
    if (handledNavigationRequestIdRef.current === sourceNavigation.requestId) return;
    handledNavigationRequestIdRef.current = sourceNavigation.requestId;
    const view = editorViewRef.current;
    if (sourceNavigation.sourceRange) {
      const position = clampOffset(sourceNavigation.sourceRange.from, sourceTextRef.current.length);
      view.dispatch({
        selection: EditorSelection.single(position),
        effects: EditorView.scrollIntoView(position, { y: "center" }),
      });
      view.focus();
      return;
    }

    const resolvedPath = resolveNavigationPath(sourceTextRef.current, sourceNavigation, source.status);
    if (!resolvedPath) return;

    const range = locateNearestJsonPath(sourceTextRef.current, resolvedPath);
    if (!range) return;
    const selection =
      range.to - range.from <= 600 ? EditorSelection.single(range.from, range.to) : EditorSelection.single(range.from);
    view.dispatch({
      selection,
      effects: EditorView.scrollIntoView(range.from, { y: "center" }),
    });
    view.focus();
  }, [editorReadyVersion, source.status, source.text, sourceNavigation]);

  const apply = () => {
    const result = applySource();
    if (!result.ok) setActiveBottomTab("source");
  };

  const applyAnyway = () => {
    void confirm({
      title: "Replace newer world changes?",
      message: "Apply this stale source draft and replace newer visual changes made elsewhere in the editor.",
      confirmLabel: "Apply anyway",
      destructive: true,
    }).then((confirmed) => {
      if (confirmed) applySource({ forceIfStale: true });
    });
  };

  const scrollSourceEditor = useCallback((
    scrollDom: HTMLElement | null,
    host: HTMLDivElement | null,
    event: { deltaMode: number; deltaX: number; deltaY: number; preventDefault: () => void },
  ) => {
    const lineHeight = 16;
    const deltaX = event.deltaMode === 1 ? event.deltaX * lineHeight : event.deltaX;
    const deltaY = event.deltaMode === 1 ? event.deltaY * lineHeight : event.deltaY;
    if (!deltaX && !deltaY) return false;

    const fallback = host ?? null;
    const activeScroller = scrollDom ?? fallback;
    if (!activeScroller) return false;

    const move = (target: HTMLElement) => {
      if (deltaX !== 0) {
        target.scrollLeft = target.scrollLeft + deltaX;
      }
      if (deltaY !== 0) {
        target.scrollTop = target.scrollTop + deltaY;
      }
    };

    const beforeVertical = activeScroller.scrollTop;
    const beforeHorizontal = activeScroller.scrollLeft;
    move(activeScroller);

    const didMove =
      activeScroller.scrollTop !== beforeVertical || activeScroller.scrollLeft !== beforeHorizontal;

    if (!didMove && fallback && fallback !== activeScroller && (fallback.scrollHeight > fallback.clientHeight || fallback.scrollWidth > fallback.clientWidth)) {
      move(fallback);
    }

    event.preventDefault();
    return true;
  }, []);

  const handleWheel: Parameters<typeof EditorView.domEventHandlers>[0]["wheel"] = (event, view) => {
    const scrollDom = view.scrollDOM ?? view.dom.querySelector<HTMLElement>(".cm-scroller") ?? null;
    return scrollSourceEditor(scrollDom, sourceEditorWrapRef.current, event);
  };

  useEffect(() => {
    const wrapNode = sourceEditorWrapRef.current;
    if (!wrapNode) return;

    const onWheel = (event: globalThis.WheelEvent) => {
      if (event.defaultPrevented) return;
      const view = editorViewRef.current;
      const scrollDom = view?.scrollDOM ?? view?.dom.querySelector<HTMLElement>(".cm-scroller") ?? null;
      scrollSourceEditor(scrollDom, wrapNode, event);
    };

    wrapNode.addEventListener("wheel", onWheel, { passive: false });
    return () => wrapNode.removeEventListener("wheel", onWheel);
  }, [scrollSourceEditor]);

  return (
    <div className="source-panel">
      <div className="source-header">
        <div className="source-status">
          <FileCode2 size={16} aria-hidden="true" />
          <strong>{statusLabel(source.status)}</strong>
          {source.isStale ? <span className="stale-pill">World changed elsewhere</span> : null}
        </div>
        <div className="source-actions">
          <button type="button" className="text-button" onClick={formatSource}>
            <Wand2 size={15} aria-hidden="true" />
            Format
          </button>
          <button type="button" className="text-button" onClick={reloadSourceFromWorld}>
            <RefreshCcw size={15} aria-hidden="true" />
            Reload from world
          </button>
          {source.isStale ? (
            <button type="button" className="text-button danger" onClick={applyAnyway}>
              <ClipboardCheck size={15} aria-hidden="true" />
              Apply anyway
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={apply} disabled={source.status === "synced" && !source.isStale}>
            <Check size={15} aria-hidden="true" />
            Apply
          </button>
        </div>
      </div>
      {sourceIssues.length > 0 ? (
        <div className="source-diagnostics" role="alert">
          {sourceIssues.slice(0, 4).map((issue) => (
            <p key={issue.id}>
              <strong>{pathText(issue.path)}</strong> {issue.message}
            </p>
          ))}
        </div>
      ) : null}
      <div
        className="source-editor-wrap"
        ref={sourceEditorWrapRef}
      >
        <CodeMirror
          value={source.text}
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            bracketMatching: true,
            searchKeymap: true,
          }}
          extensions={[json(), EditorView.domEventHandlers({ wheel: handleWheel, mousewheel: handleWheel })]}
          theme="dark"
          aria-label="World JSON source"
          onCreateEditor={(view) => {
            editorViewRef.current = view;
            setEditorReadyVersion((version) => version + 1);
          }}
          onChange={(value) => setSourceText(value)}
        />
      </div>
      {dialog}
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "synced") return "In sync";
  if (status === "dirty") return "Modified";
  if (status === "invalid") return "Invalid JSON";
  return "Cannot apply";
}

function resolveNavigationPath(
  text: string,
  request: NonNullable<ReturnType<typeof useEditorStore.getState>["sourceNavigation"]>,
  sourceStatus: string,
) {
  if (!request.target || request.target.kind === "world") return request.path;

  const targetPath = sourcePathForTarget(text, request.target);
  if (!targetPath) return sourceStatus === "synced" ? request.path : null;

  if (request.target.kind === "scene" && request.path[0] === "scenes") {
    return [...targetPath, ...request.path.slice(2)];
  }

  if (request.target.kind === "entity" && request.path[0] === "scenes" && request.path[2] === "entities") {
    return [...targetPath, ...request.path.slice(4)];
  }

  return targetPath;
}

function clampOffset(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

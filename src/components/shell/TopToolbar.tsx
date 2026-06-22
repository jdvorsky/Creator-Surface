import { Activity, Copy, Download, FileInput, MousePointer2, PackagePlus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { contentTypeOptions } from "../../domain/contentTypes";
import type { SupportedEntityType } from "../../domain/model";
import { serializeWorld } from "../../domain/serialization";
import { buildDiagnosticsSnapshot } from "../../platform/diagnostics";
import { recordTelemetryEvent } from "../../platform/telemetry";
import { useIssueCounts } from "../../store/derived";
import { useEditorStore } from "../../store/editorStore";

type ToolbarMessage = {
  kind: "success" | "error";
  text: string;
};

export function TopToolbar() {
  const world = useEditorStore((state) => state.world);
  const revision = useEditorStore((state) => state.revision);
  const source = useEditorStore((state) => state.source);
  const placementType = useEditorStore((state) => state.placementType);
  const setPlacementType = useEditorStore((state) => state.setPlacementType);
  const createScene = useEditorStore((state) => state.createScene);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.history.past.length > 0);
  const canRedo = useEditorStore((state) => state.history.future.length > 0);
  const setSourceText = useEditorStore((state) => state.setSourceText);
  const setActiveBottomTab = useEditorStore((state) => state.setActiveBottomTab);
  const applySource = useEditorStore((state) => state.applySource);
  const clearLocalData = useEditorStore((state) => state.clearLocalData);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [toolbarMessage, setToolbarMessage] = useState<ToolbarMessage | null>(null);
  const { errors: errorCount, warnings: warningCount } = useIssueCounts();

  const showToolbarMessage = (text: string, kind: ToolbarMessage["kind"] = "success") => {
    setToolbarMessage({ kind, text });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = historyShortcut(event);
      if (!shortcut || editableTargetOwnsShortcut(event.target)) return;

      const state = useEditorStore.getState();
      const canUseShortcut = shortcut === "undo" ? state.history.past.length > 0 : state.history.future.length > 0;
      if (!canUseShortcut) return;

      event.preventDefault();
      if (shortcut === "undo") {
        state.undo();
      } else {
        state.redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const importFile = (file: File | undefined) => {
    if (!file) return;
    void readFileText(file)
      .then((text) => {
        setSourceText(text, { resetStale: true });
        setActiveBottomTab("source");
        const result = applySource();
        recordTelemetryEvent(
          result.ok
            ? {
                name: "world.import",
                revision: useEditorStore.getState().revision,
                result: "ok",
              }
            : {
                name: "world.import",
                revision: useEditorStore.getState().revision,
                result: "blocked",
                counts: { issues: result.issues.length },
              },
        );
        if (result.ok) {
          showToolbarMessage("Imported JSON into the committed world.");
        } else {
          showToolbarMessage("Import could not apply; review Source diagnostics.", "error");
        }
      })
      .catch(() => {
        setActiveBottomTab("source");
        recordTelemetryEvent({
          name: "world.import",
          revision: useEditorStore.getState().revision,
          result: "error",
        });
        showToolbarMessage("Import failed; choose a readable JSON file.", "error");
      });
  };

  const copyJson = () => {
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) {
      showToolbarMessage("Copy failed; clipboard is unavailable.", "error");
      return;
    }

    void clipboard
      .writeText(serializeWorld(world))
      .then(() => {
        showToolbarMessage("Copied committed JSON.");
      })
      .catch(() => {
        showToolbarMessage("Copy failed; use Download JSON or Source JSON.", "error");
      });
  };

  const downloadJson = () => {
    try {
      downloadBlob(`${world.id}.json`, serializeWorld(world), "application/json");
      recordTelemetryEvent({ name: "world.export", revision, result: "ok" });
      showToolbarMessage("Downloaded committed JSON.");
    } catch {
      recordTelemetryEvent({ name: "world.export", revision, result: "error" });
      showToolbarMessage("Download failed; try Copy JSON or Source JSON.", "error");
    }
  };

  const downloadDiagnostics = () => {
    const currentRevision = useEditorStore.getState().revision;
    try {
      recordTelemetryEvent({ name: "diagnostics.export", revision: currentRevision, result: "ok" });
      downloadBlob("creator-surface-diagnostics.json", `${JSON.stringify(buildDiagnosticsSnapshot(), null, 2)}\n`, "application/json");
      showToolbarMessage("Downloaded diagnostics.");
    } catch {
      recordTelemetryEvent({ name: "diagnostics.export", revision: currentRevision, result: "error" });
      showToolbarMessage("Diagnostics download failed.", "error");
    }
  };

  const clearLocalEditorData = () => {
    clearLocalData();
    showToolbarMessage("Cleared local browser data.");
  };

  return (
    <header className="top-toolbar">
      <div className="brand-block">
        <span className="brand-mark">CS</span>
        <div>
          <h1>{world.name}</h1>
          <p>
            Revision {revision} - {statusLabel(source.status)}
            {source.isStale ? " - World changed elsewhere" : ""}
          </p>
        </div>
      </div>
      <div className="toolbar-group" aria-label="History controls">
        <button type="button" className="icon-button" aria-label="Undo" title="Undo" onClick={undo} disabled={!canUndo}>
          <Undo2 size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Redo" title="Redo" onClick={redo} disabled={!canRedo}>
          <Redo2 size={16} aria-hidden="true" />
        </button>
      </div>
      <label className="placement-control">
        <PackagePlus size={16} aria-hidden="true" />
        <span>Add/Place</span>
        <select
          aria-label="Add/Place"
          value={placementType ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "scene") {
              createScene();
              setPlacementType(null);
              return;
            }
            setPlacementType(value ? (value as SupportedEntityType) : null);
          }}
        >
          <option value="">Select action</option>
          <option value="scene">Add scene</option>
          {contentTypeOptions().map((type) => (
            <option value={type.id} key={type.id}>
              Place {type.label}
            </option>
          ))}
        </select>
      </label>
      {placementType ? (
        <button type="button" className="text-button" onClick={() => setPlacementType(null)}>
          <MousePointer2 size={15} aria-hidden="true" />
          Cancel place
        </button>
      ) : null}
      {toolbarMessage ? (
        <p
          className={`toolbar-message toolbar-message-${toolbarMessage.kind}`}
          role={toolbarMessage.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {toolbarMessage.text}
        </p>
      ) : null}
      <div className="toolbar-spacer" />
      <div className="status-pills" aria-label="Validation summary">
        <button type="button" className={errorCount > 0 ? "pill pill-error" : "pill"} onClick={() => setActiveBottomTab("problems")}>
          {errorCount} errors
        </button>
        <button type="button" className={warningCount > 0 ? "pill pill-warning" : "pill"} onClick={() => setActiveBottomTab("problems")}>
          {warningCount} warnings
        </button>
      </div>
      <div className="toolbar-group" aria-label="Import, export, and diagnostics">
        <button
          type="button"
          className="icon-button"
          aria-label="Copy JSON"
          title="Copy JSON"
          onClick={copyJson}
        >
          <Copy size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Download JSON" title="Download JSON" onClick={downloadJson}>
          <Download size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Import JSON" title="Import JSON" onClick={() => inputRef.current?.click()}>
          <FileInput size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Download diagnostics" title="Download diagnostics" onClick={downloadDiagnostics}>
          <Activity size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Clear local data" title="Clear local data" onClick={clearLocalEditorData}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            importFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
    </header>
  );
}

function statusLabel(status: string) {
  if (status === "synced") return "In sync";
  if (status === "dirty") return "Modified";
  if (status === "invalid") return "Invalid JSON";
  return "Cannot apply";
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsText(file);
  });
}

function downloadBlob(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function historyShortcut(event: KeyboardEvent): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) return "undo";
  if (key === "z" && event.shiftKey) return "redo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

function editableTargetOwnsShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".cm-editor")) return true;
  if (target.isContentEditable || target.closest("[contenteditable='true']")) return true;
  if (target.getAttribute("role") === "textbox") return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

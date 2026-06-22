import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Map, PanelBottom, SlidersHorizontal, SplitSquareHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { MapWorkspace } from "../components/map/MapWorkspace";
import { ProblemsPanel } from "../components/problems/ProblemsPanel";
import { SceneGraphPanel } from "../components/scene-graph/SceneGraphPanel";
import { SourcePanel } from "../components/source/SourcePanel";
import { LocalDataBanner } from "../components/shell/LocalDataBanner";
import { StatusBar } from "../components/shell/StatusBar";
import { TopToolbar } from "../components/shell/TopToolbar";
import { PropertiesPanel } from "../components/inspector/PropertiesPanel";
import { useIssueLookup } from "../store/derived";
import { useEditorStore } from "../store/editorStore";

export function EditorShell() {
  const activeBottomTab = useEditorStore((state) => state.activeBottomTab);
  const setActiveBottomTab = useEditorStore((state) => state.setActiveBottomTab);
  const issueLookup = useIssueLookup();
  const sourceIssueCount = useEditorStore((state) => state.source.syntaxIssues.length + state.source.structuralIssues.length);
  const selectAdjacentTab = () => {
    const nextTab = activeBottomTab === "source" ? "problems" : "source";
    setActiveBottomTab(nextTab);
    window.setTimeout(() => document.getElementById(`${nextTab}-tab`)?.focus(), 0);
  };

  return (
    <div className="editor-shell" data-modal-background="true">
      <div className="shell-top">
        <TopToolbar />
        <LocalDataBanner />
      </div>
      <PanelGroup direction="vertical" className="editor-panels">
        <Panel defaultSize={68} minSize={42}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={22} minSize={16} className="panel-column">
              <section className="panel scene-graph-panel" aria-label="Scene graph">
                <PanelTitle icon={<SplitSquareHorizontal aria-hidden="true" size={16} />} title="Scene graph" />
                <SceneGraphPanel />
              </section>
            </Panel>
            <PanelResizeHandle
              className="resize-handle resize-handle-vertical"
              aria-label="Resize scene graph and map panels"
              title="Resize scene graph and map panels"
            />
            <Panel defaultSize={56} minSize={32} className="panel-column">
              <section className="panel map-panel" aria-label="Map workspace">
                <PanelTitle icon={<Map aria-hidden="true" size={16} />} title="Map" />
                <MapWorkspace />
              </section>
            </Panel>
            <PanelResizeHandle
              className="resize-handle resize-handle-vertical"
              aria-label="Resize map and properties panels"
              title="Resize map and properties panels"
            />
            <Panel defaultSize={22} minSize={18} className="panel-column">
              <section className="panel properties-panel" aria-label="Properties">
                <PanelTitle icon={<SlidersHorizontal aria-hidden="true" size={16} />} title="Properties" />
                <PropertiesPanel />
              </section>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle
          className="resize-handle resize-handle-horizontal"
          aria-label="Resize editor and bottom dock"
          title="Resize editor and bottom dock"
        />
        <Panel defaultSize={32} minSize={20} className="bottom-dock">
          <section className="panel dock-panel" aria-label="Bottom dock">
            <div className="dock-tabs" role="tablist" aria-label="Bottom panels">
              <button
                id="source-tab"
                type="button"
                role="tab"
                aria-selected={activeBottomTab === "source"}
                aria-controls="source-panel"
                tabIndex={activeBottomTab === "source" ? 0 : -1}
                className={activeBottomTab === "source" ? "tab tab-active" : "tab"}
                onClick={() => setActiveBottomTab("source")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    selectAdjacentTab();
                  }
                }}
              >
                Source JSON
                {sourceIssueCount > 0 ? <span className="badge">{sourceIssueCount}</span> : null}
              </button>
              <button
                id="problems-tab"
                type="button"
                role="tab"
                aria-selected={activeBottomTab === "problems"}
                aria-controls="problems-panel"
                tabIndex={activeBottomTab === "problems" ? 0 : -1}
                className={activeBottomTab === "problems" ? "tab tab-active" : "tab"}
                onClick={() => setActiveBottomTab("problems")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    selectAdjacentTab();
                  }
                }}
              >
                Problems
                {issueLookup.all.length > 0 ? <span className="badge">{issueLookup.all.length}</span> : null}
              </button>
              <span className="dock-spacer" />
              <PanelBottom aria-hidden="true" size={15} />
            </div>
            <div
              id={activeBottomTab === "source" ? "source-panel" : "problems-panel"}
              className="dock-content"
              role="tabpanel"
              aria-labelledby={activeBottomTab === "source" ? "source-tab" : "problems-tab"}
            >
              {activeBottomTab === "source" ? <SourcePanel /> : <ProblemsPanel />}
            </div>
          </section>
        </Panel>
      </PanelGroup>
      <StatusBar />
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

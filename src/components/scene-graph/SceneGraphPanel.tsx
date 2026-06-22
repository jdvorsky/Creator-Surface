import { AlertCircle, ChevronDown, ChevronRight, CircleHelp, Globe2, Layers3, MapPin, Package, UserRound, Waypoints } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { contentTypeOptions, isSupportedType } from "../../domain/contentTypes";
import type { EntityDocument, Selection, ValidationIssue, WorldIndex } from "../../domain/model";
import { entityIssues, sceneIssues, useIssueLookup, useWorldIndex, type IssueLookup } from "../../store/derived";
import { useEditorStore } from "../../store/editorStore";

const iconByType = {
  location: MapPin,
  character: UserRound,
  item: Package,
  portal: Waypoints,
};

export function SceneGraphPanel() {
  const treeRef = useRef<HTMLDivElement | null>(null);
  const world = useEditorStore((state) => state.world);
  const selection = useEditorStore((state) => state.selection);
  const expandedNodeIds = useEditorStore((state) => state.expandedNodeIds);
  const toggleNodeExpanded = useEditorStore((state) => state.toggleNodeExpanded);
  const selectWorld = useEditorStore((state) => state.selectWorld);
  const selectScene = useEditorStore((state) => state.selectScene);
  const selectEntity = useEditorStore((state) => state.selectEntity);
  const revealSourceForSelection = useEditorStore((state) => state.revealSourceForSelection);
  const issueLookup = useIssueLookup();
  const index = useWorldIndex();

  useEffect(() => {
    syncRovingTreeFocus(treeRef.current);
  }, [expandedNodeIds, selection, world]);

  return (
    <div
      ref={treeRef}
      className="tree"
      role="tree"
      aria-label="World scene graph"
      onFocusCapture={handleTreeFocus}
      onKeyDown={handleTreeKeyDown}
    >
      <button
        type="button"
        role="treeitem"
        aria-selected={selection.kind === "world"}
        tabIndex={-1}
        className={selection.kind === "world" ? "tree-row tree-row-selected" : "tree-row"}
        onClick={() => {
          selectWorld();
          revealSourceForSelection({ kind: "world" });
        }}
      >
        <Globe2 size={16} aria-hidden="true" />
        <span className="tree-label">{world.name}</span>
        <IssueBadge issues={issueLookup.all} />
      </button>
      <div className="tree-branch">
        <TreeDisclosure
          id="scenes"
          label={`Scenes (${world.scenes.length})`}
          expanded={expandedNodeIds.scenes ?? true}
          onToggle={() => toggleNodeExpanded("scenes")}
          icon={<Layers3 size={16} aria-hidden="true" />}
        />
        <div id="scenes:branch" className="tree-branch" role="group" hidden={!(expandedNodeIds.scenes ?? true)}>
            {world.scenes.map((scene) => {
              const sceneNodeId = `scene:${scene.id}`;
              const currentSceneIssues = sceneIssues(issueLookup, scene.id);
              const isSceneSelected = selection.kind === "scene" && selection.sceneId === scene.id;
              const sceneExpanded = expandedNodeIds[sceneNodeId] ?? true;
              return (
                <div className="tree-section" key={scene.id}>
                  <div className="tree-row-combo">
                    <TreeDisclosure
                      id={sceneNodeId}
                      label=""
                      expanded={sceneExpanded}
                      onToggle={() => toggleNodeExpanded(sceneNodeId)}
                      ariaLabel={sceneExpanded ? `Collapse ${scene.name}` : `Expand ${scene.name}`}
                      compact
                    />
                    <button
                      type="button"
                      role="treeitem"
                      aria-selected={isSceneSelected}
                      tabIndex={-1}
                      className={isSceneSelected ? "tree-row tree-row-selected tree-row-flex" : "tree-row tree-row-flex"}
                      onClick={() => {
                        const nextSelection = { kind: "scene", sceneId: scene.id } satisfies Selection;
                        selectScene(scene.id);
                        revealSourceForSelection(nextSelection);
                      }}
                    >
                      <MapPin size={16} aria-hidden="true" />
                      <span className="tree-label">{scene.name}</span>
                      <span className="tree-meta">{scene.id}</span>
                      <IssueBadge issues={currentSceneIssues} />
                    </button>
                  </div>
                  <div id={`${sceneNodeId}:branch`} className="tree-branch" role="group" hidden={!sceneExpanded}>
                      {contentTypeOptions().map((definition) => {
                        const entities = scene.entities.filter((entity) => entity.type === definition.id);
                        return (
                          <EntityGroup
                            key={definition.id}
                            sceneId={scene.id}
                            type={definition.id}
                            label={definition.pluralLabel}
                            entities={entities}
                            expanded={expandedNodeIds[`group:${scene.id}:${definition.id}`] ?? true}
                            onToggle={() => toggleNodeExpanded(`group:${scene.id}:${definition.id}`)}
                            selectedEntityId={selection.kind === "entity" ? selection.entityId : null}
                            selectEntity={selectEntity}
                            revealSourceForSelection={revealSourceForSelection}
                            issueLookup={issueLookup}
                            portalSummary={(entity) => portalSummary(entity, index)}
                          />
                        );
                      })}
                      <EntityGroup
                        sceneId={scene.id}
                        type="unsupported"
                        label="Unsupported"
                        entities={scene.entities.filter((entity) => !isSupportedType(entity.type))}
                        expanded={expandedNodeIds[`group:${scene.id}:unsupported`] ?? true}
                        onToggle={() => toggleNodeExpanded(`group:${scene.id}:unsupported`)}
                        selectedEntityId={selection.kind === "entity" ? selection.entityId : null}
                        selectEntity={selectEntity}
                        revealSourceForSelection={revealSourceForSelection}
                        issueLookup={issueLookup}
                        portalSummary={() => null}
                      />
                  </div>
                </div>
              );
            })}
          </div>
      </div>
    </div>
  );
}

function EntityGroup({
  sceneId,
  type,
  label,
  entities,
  expanded,
  onToggle,
  selectedEntityId,
  selectEntity,
  revealSourceForSelection,
  issueLookup,
  portalSummary,
}: {
  sceneId: string;
  type: string;
  label: string;
  entities: EntityDocument[];
  expanded: boolean;
  onToggle: () => void;
  selectedEntityId: string | null;
  selectEntity: (sceneId: string, entityId: string) => void;
  revealSourceForSelection: (selection: Selection) => void;
  issueLookup: IssueLookup;
  portalSummary: (entity: EntityDocument) => string | null;
}) {
  const groupIssues = entities.flatMap((entity) => entityIssues(issueLookup, entity.id));
  const Icon = type === "unsupported" ? CircleHelp : iconByType[type as keyof typeof iconByType];

  return (
    <div className="tree-section">
      <TreeDisclosure
        id={`group:${sceneId}:${type}`}
        label={`${label} (${entities.length})`}
        expanded={expanded}
        onToggle={onToggle}
        icon={<Icon size={15} aria-hidden="true" />}
      >
        <IssueBadge issues={groupIssues} />
      </TreeDisclosure>
      <div id={`group:${sceneId}:${type}:branch`} className="tree-branch" role="group" hidden={!expanded}>
          {entities.map((entity) => {
            const currentEntityIssues = entityIssues(issueLookup, entity.id);
            const selected = selectedEntityId === entity.id;
            const secondary = entity.type === "portal" ? portalSummary(entity) : entity.id;
            return (
              <button
                type="button"
                role="treeitem"
                aria-selected={selected}
                tabIndex={-1}
                className={selected ? "tree-row tree-row-selected tree-row-entity" : "tree-row tree-row-entity"}
                key={entity.id}
                onClick={() => {
                  const nextSelection = { kind: "entity", sceneId, entityId: entity.id } satisfies Selection;
                  selectEntity(sceneId, entity.id);
                  revealSourceForSelection(nextSelection);
                }}
                title={entity.id}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="tree-text">
                  <span className="tree-label">{entity.name}</span>
                  <span className={currentEntityIssues.length > 0 ? "tree-meta tree-meta-warning" : "tree-meta"}>{secondary}</span>
                </span>
                <IssueBadge issues={currentEntityIssues} />
              </button>
            );
          })}
        </div>
    </div>
  );
}

function TreeDisclosure({
  id,
  label,
  expanded,
  onToggle,
  icon,
  compact,
  ariaLabel,
  children,
}: {
  id: string;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  compact?: boolean;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="treeitem"
      tabIndex={-1}
      className={compact ? "tree-row tree-disclosure tree-disclosure-compact" : "tree-row tree-disclosure"}
      aria-label={ariaLabel ?? (expanded ? `Collapse ${label}` : `Expand ${label}`)}
      aria-expanded={expanded}
      aria-controls={`${id}:branch`}
      onClick={onToggle}
    >
      {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
      {icon}
      {label ? <span className="tree-label">{label}</span> : null}
      {children}
    </button>
  );
}

function IssueBadge({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return (
    <span
      className={errors > 0 ? "issue-badge issue-badge-error" : "issue-badge issue-badge-warning"}
      title={`${errors} errors, ${warnings} warnings`}
      aria-label={`${errors} errors, ${warnings} warnings`}
    >
      <AlertCircle size={12} aria-hidden="true" />
      {issues.length}
    </span>
  );
}

function handleTreeFocus(event: FocusEvent<HTMLDivElement>) {
  if (event.target instanceof HTMLButtonElement && event.target.classList.contains("tree-row")) {
    setRovingTreeItem(event.currentTarget, event.target);
  }
}

function handleTreeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  const active = document.activeElement;
  if (!(active instanceof HTMLButtonElement) || !event.currentTarget.contains(active)) return;

  const rows = visibleTreeButtons(event.currentTarget);
  const currentIndex = rows.indexOf(active);
  if (currentIndex < 0) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusTreeButton(event.currentTarget, rows[Math.min(currentIndex + 1, rows.length - 1)]);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusTreeButton(event.currentTarget, rows[Math.max(currentIndex - 1, 0)]);
  }
  if (event.key === "Home") {
    event.preventDefault();
    focusTreeButton(event.currentTarget, rows[0]);
  }
  if (event.key === "End") {
    event.preventDefault();
    focusTreeButton(event.currentTarget, rows.at(-1));
  }
  if (event.key === "ArrowRight") {
    const expanded = active.getAttribute("aria-expanded");
    if (expanded === "false") {
      event.preventDefault();
      active.click();
      return;
    }
    if (expanded === "true") {
      event.preventDefault();
      focusTreeButton(event.currentTarget, rows[Math.min(currentIndex + 1, rows.length - 1)]);
    }
  }
  if (event.key === "ArrowLeft") {
    if (active.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      active.click();
      return;
    }
    const previousDisclosure = rows
      .slice(0, currentIndex)
      .reverse()
      .find((row) => row.hasAttribute("aria-expanded"));
    if (previousDisclosure) {
      event.preventDefault();
      focusTreeButton(event.currentTarget, previousDisclosure);
    }
  }
}

function syncRovingTreeFocus(root: HTMLElement | null): void {
  if (!root) return;
  const rows = visibleTreeButtons(root);
  if (rows.length === 0) return;
  const active = document.activeElement;
  const activeRow = active instanceof HTMLButtonElement && rows.includes(active) ? active : null;
  const selectedRow = rows.find((row) => row.getAttribute("aria-selected") === "true");
  const fallbackRow = activeRow ?? selectedRow ?? rows[0];
  if (!fallbackRow) return;
  setRovingTreeItem(root, fallbackRow);
}

function focusTreeButton(root: HTMLElement, row: HTMLButtonElement | undefined): void {
  if (!row) return;
  setRovingTreeItem(root, row);
  row.focus();
}

function setRovingTreeItem(root: HTMLElement, active: HTMLButtonElement): void {
  for (const row of visibleTreeButtons(root)) {
    row.tabIndex = row === active ? 0 : -1;
  }
}

function visibleTreeButtons(root: HTMLElement | null): HTMLButtonElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLButtonElement>("button.tree-row")].filter(
    (button) => !button.closest("[hidden]"),
  );
}

function portalSummary(entity: EntityDocument, index: WorldIndex): string {
  const target = entity.data?.target;
  if (!target) return "-> Target not set";
  if (typeof target !== "object" || Array.isArray(target) || target === null) return "-> Invalid target";
  const record = target as Record<string, unknown>;
  const kind = record.kind;
  const id = record.id;
  if (typeof kind !== "string" || typeof id !== "string" || id.trim().length === 0) return "-> Invalid target";
  if (kind === "scene") {
    const scene = index.scenesById.get(id);
    return scene ? `-> Scene: ${scene.name} (${id})` : `-> Missing scene: ${id}`;
  }
  if (kind === "entity") {
    const targetEntity = index.entitiesById.get(id);
    if (!targetEntity) return `-> Missing entity: ${id}`;
    const sceneId = index.sceneIdByEntityId.get(id);
    const scene = sceneId ? index.scenesById.get(sceneId) : null;
    return scene ? `-> Entity: ${scene.name} / ${targetEntity.name} (${id})` : `-> Entity: ${targetEntity.name} (${id})`;
  }
  return "-> Invalid target";
}

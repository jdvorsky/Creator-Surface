import { create } from "zustand";
import {
  changeEntityTypeInWorld,
  renameSceneInWorld,
  createEntityInWorld,
  createSceneInWorld,
  deleteEntityInWorld,
  deleteSceneInWorld,
  duplicateEntityInWorld,
  duplicateSceneInWorld,
  renameEntityInWorld,
  setSceneBoundsInWorld,
  setEntityPositionInWorld,
} from "../domain/commands";
import { contentTypeRegistry, isSupportedType } from "../domain/contentTypes";
import { createReadableEntityId, createReadableSceneId } from "../domain/ids";
import { buildWorldIndex } from "../domain/indexing";
import type { ApplySourceResult, CameraState, Position, Selection, SupportedEntityType, ValidationIssue, WorldDocument, WorldIndex } from "../domain/model";
import { sampleWorld } from "../domain/sampleWorld";
import { serializeWorld } from "../domain/serialization";
import { initialSelection, reconcileSelection } from "../domain/selection";
import type { SourceNavigationTarget, SourcePath, SourceRange } from "../domain/sourceLocation";
import { parseJsonSource, validateCommittedWorld, validateUnknownWorld } from "../domain/validation";
import { recordCommandJournalEntry } from "../platform/changeJournal";
import {
  clearLocalEditorData,
  clearSourceDraftRecovery,
  readLocalData,
  savePersistedWorldSnapshot,
  saveSourceDraftRecovery,
  type LocalDataSnapshot,
} from "../platform/localPersistence";
import { recordTelemetryEvent } from "../platform/telemetry";
import type { HistoryState } from "./history";
import { boundedHistory, pushHistory } from "./history";
import type { SourceState } from "./sourceState";
import { classifySourceDraft, syncOrStaleSource } from "./sourceState";

export interface DragPreview {
  sceneId: string;
  entityId: string;
  origin: Position;
  current: Position;
}

export interface SourceNavigationRequest {
  path: SourcePath;
  requestId: number;
  target?: SourceNavigationTarget;
  sourceRange?: SourceRange;
}

export interface FocusedIssueRequest {
  issueId: string;
  requestId: number;
}

interface CommitWorldOptions {
  commandKind: string;
  affectedIds?: string[];
}

export interface EditorStore {
  world: WorldDocument;
  revision: number;
  history: HistoryState;
  selection: Selection;
  expandedNodeIds: Record<string, boolean>;
  source: SourceState;
  issues: ValidationIssue[];
  sourceNavigation: SourceNavigationRequest | null;
  focusedIssue: FocusedIssueRequest | null;
  camerasBySceneId: Record<string, CameraState>;
  activeBottomTab: "source" | "problems";
  snapToGrid: boolean;
  gridSize: number;
  placementType: SupportedEntityType | null;
  dragPreview: DragPreview | null;
  localData: LocalDataSnapshot;
  detectLocalData: () => void;
  restorePersistedWorld: () => void;
  resetToSampleWorld: () => void;
  restoreSourceDraft: () => void;
  discardSourceDraft: () => void;
  clearLocalData: () => void;
  selectWorld: () => void;
  selectScene: (sceneId: string) => void;
  selectEntity: (sceneId: string, entityId: string) => void;
  renameEntity: (entityId: string, name: string) => void;
  renameScene: (sceneId: string, name: string) => void;
  changeEntityType: (entityId: string, type: string) => void;
  setSceneBounds: (sceneId: string, bounds: { width: number; height: number }) => void;
  setEntityPosition: (entityId: string, position: Position) => void;
  beginEntityDrag: (entityId: string) => void;
  previewEntityDrag: (position: Position) => void;
  commitEntityDrag: () => void;
  cancelEntityDrag: () => void;
  setSourceText: (text: string, options?: { resetStale?: boolean }) => void;
  reloadSourceFromWorld: () => void;
  formatSource: () => void;
  applySource: (options?: { forceIfStale?: boolean }) => ApplySourceResult;
  undo: () => void;
  redo: () => void;
  setPlacementType: (type: SupportedEntityType | null) => void;
  createEntity: (sceneId: string, type: SupportedEntityType, position: Position) => void;
  createScene: () => void;
  deleteScene: (sceneId: string) => void;
  duplicateScene: (sceneId: string) => void;
  deleteEntity: (entityId: string) => void;
  duplicateEntity: (entityId: string) => void;
  setActiveBottomTab: (tab: "source" | "problems") => void;
  toggleNodeExpanded: (nodeId: string) => void;
  revealSourceForSelection: (selection: Selection) => void;
  revealSourcePath: (path: SourcePath, options?: { target?: SourceNavigationTarget; sourceRange?: SourceRange }) => void;
  focusIssue: (issueId: string) => void;
  setSceneCamera: (sceneId: string, camera: CameraState) => void;
  commitWorld: (nextWorld: WorldDocument, preferredSelection: Selection, options: CommitWorldOptions) => void;
}

const initialWorld = structuredClone(sampleWorld);
const initialText = serializeWorld(initialWorld);

export const useEditorStore = create<EditorStore>((set, get) => ({
  world: initialWorld,
  revision: 0,
  history: { past: [], future: [], limit: 100 },
  selection: initialSelection(initialWorld),
  expandedNodeIds: defaultExpanded(initialWorld),
  source: {
    text: initialText,
    baseRevision: 0,
    status: "synced",
    isStale: false,
    syntaxIssues: [],
    structuralIssues: [],
  },
  issues: validateCommittedWorld(initialWorld),
  sourceNavigation: null,
  focusedIssue: null,
  camerasBySceneId: {},
  activeBottomTab: "source",
  snapToGrid: false,
  gridSize: 24,
  placementType: null,
  dragPreview: null,
  localData: { persistedWorld: null, draftRecovery: null },
  detectLocalData: () => {
    set({ localData: readLocalData() });
  },
  restorePersistedWorld: () => {
    const snapshot = get().localData.persistedWorld;
    if (!snapshot) return;
    const world = structuredClone(snapshot.world);
    const revision = snapshot.revision;
    const issues = validateCommittedWorld(world);
    recordTelemetryEvent({ name: "local.restore_world", revision, result: "ok", counts: issueCounts(issues) });
    recordCommandJournalEntry({
      revision,
      commandKind: "local.restore_world",
      affectedIds: [world.id],
      result: "ok",
      issueCounts: issueCounts(issues),
    });
    set((state) => ({
      world,
      revision,
      history: { past: [], future: [], limit: state.history.limit },
      selection: initialSelection(world),
      expandedNodeIds: defaultExpanded(world),
      source: {
        text: serializeWorld(world),
        baseRevision: revision,
        status: "synced",
        isStale: false,
        syntaxIssues: [],
        structuralIssues: [],
      },
      issues,
      localData: { ...state.localData, persistedWorld: null },
    }));
  },
  resetToSampleWorld: () => {
    clearLocalEditorData();
    const world = structuredClone(sampleWorld);
    const issues = validateCommittedWorld(world);
    recordTelemetryEvent({ name: "local.reset_to_sample", revision: 0, result: "ok", counts: issueCounts(issues) });
    recordCommandJournalEntry({
      revision: 0,
      commandKind: "local.reset_to_sample",
      affectedIds: [world.id],
      result: "ok",
      issueCounts: issueCounts(issues),
    });
    set({
      world,
      revision: 0,
      history: { past: [], future: [], limit: get().history.limit },
      selection: initialSelection(world),
      expandedNodeIds: defaultExpanded(world),
      source: {
        text: serializeWorld(world),
        baseRevision: 0,
        status: "synced",
        isStale: false,
        syntaxIssues: [],
        structuralIssues: [],
      },
      issues,
      localData: { persistedWorld: null, draftRecovery: null },
    });
  },
  restoreSourceDraft: () => {
    const recovery = get().localData.draftRecovery;
    if (!recovery) return;
    set((state) => {
      const classifiedSource = classifySourceDraft(state.source, state.world, state.revision, recovery.text, { resetStale: true });
      const nextSource =
        classifiedSource.status === "synced"
          ? classifiedSource
          : {
              ...classifiedSource,
              baseRevision: recovery.baseRevision,
              isStale: recovery.baseRevision !== state.revision,
            };
      saveSourceDraftRecovery(nextSource.text, nextSource.baseRevision);
      recordTelemetryEvent({ name: "local.restore_draft", revision: state.revision, result: "ok" });
      return {
        activeBottomTab: "source",
        source: nextSource,
        localData: { ...state.localData, draftRecovery: null },
      };
    });
  },
  discardSourceDraft: () => {
    clearSourceDraftRecovery();
    set((state) => ({
      localData: { ...state.localData, draftRecovery: null },
    }));
  },
  clearLocalData: () => {
    clearLocalEditorData();
    recordTelemetryEvent({ name: "local.clear_data", revision: get().revision, result: "ok" });
    set({ localData: { persistedWorld: null, draftRecovery: null } });
  },
  selectWorld: () => set({ selection: { kind: "world" } }),
  selectScene: (sceneId) =>
    set((state) => (buildWorldIndex(state.world).scenesById.has(sceneId) ? { selection: { kind: "scene", sceneId }, expandedNodeIds: { ...state.expandedNodeIds, [`scene:${sceneId}`]: true } } : {})),
  selectEntity: (sceneId, entityId) =>
    set((state) => {
      const index = buildWorldIndex(state.world);
      if (!index.entitiesById.has(entityId)) return {};
      const resolvedSceneId = index.sceneIdByEntityId.get(entityId) ?? sceneId;
      return {
        selection: { kind: "entity", sceneId: resolvedSceneId, entityId },
        expandedNodeIds: {
          ...state.expandedNodeIds,
          [`scene:${resolvedSceneId}`]: true,
          [`group:${resolvedSceneId}:${entityGroupKey(index.entitiesById.get(entityId)?.type)}`]: true,
        },
      };
    }),
  renameEntity: (entityId, name) => {
    get().commitWorld(renameEntityInWorld(get().world, entityId, name), get().selection, {
      commandKind: "entity.rename",
      affectedIds: [entityId],
    });
  },
  renameScene: (sceneId, name) => {
    get().commitWorld(renameSceneInWorld(get().world, sceneId, name), get().selection, {
      commandKind: "scene.rename",
      affectedIds: [sceneId],
    });
  },
  changeEntityType: (entityId, type) => {
    get().commitWorld(changeEntityTypeInWorld(get().world, entityId, type), get().selection, {
      commandKind: "entity.change_type",
      affectedIds: [entityId],
    });
  },
  setSceneBounds: (sceneId, bounds) => {
    get().commitWorld(setSceneBoundsInWorld(get().world, sceneId, bounds), get().selection, {
      commandKind: "scene.set_bounds",
      affectedIds: [sceneId],
    });
  },
  setEntityPosition: (entityId, position) => {
    get().commitWorld(setEntityPositionInWorld(get().world, entityId, position), get().selection, {
      commandKind: "entity.position",
      affectedIds: [entityId],
    });
  },
  beginEntityDrag: (entityId) =>
    set((state) => {
      const index = buildWorldIndex(state.world);
      const entity = index.entitiesById.get(entityId);
      const sceneId = index.sceneIdByEntityId.get(entityId);
      if (!entity || !sceneId) return {};
      return {
        selection: { kind: "entity", sceneId, entityId },
        dragPreview: { sceneId, entityId, origin: entity.position, current: entity.position },
      };
    }),
  previewEntityDrag: (position) =>
    set((state) =>
      state.dragPreview
        ? {
            dragPreview: {
              ...state.dragPreview,
              current: maybeSnap(position, state.snapToGrid, state.gridSize),
            },
          }
        : {},
    ),
  commitEntityDrag: () => {
    const preview = get().dragPreview;
    if (!preview) return;
    const world = setEntityPositionInWorld(get().world, preview.entityId, preview.current);
    set({ dragPreview: null });
    get().commitWorld(world, { kind: "entity", sceneId: preview.sceneId, entityId: preview.entityId }, {
      commandKind: "entity.drag_commit",
      affectedIds: [preview.entityId],
    });
  },
  cancelEntityDrag: () => set({ dragPreview: null }),
  setSourceText: (text, options) =>
    set((state) => {
      const source = classifySourceDraft(state.source, state.world, state.revision, text, options);
      persistSourceRecovery(source);
      return { source };
    }),
  reloadSourceFromWorld: () =>
    set((state) => {
      clearSourceDraftRecovery();
      return {
        source: {
        text: serializeWorld(state.world),
        baseRevision: state.revision,
        status: "synced",
        isStale: false,
        syntaxIssues: [],
        structuralIssues: [],
      },
      };
    }),
  formatSource: () => {
    const parsed = parseJsonSource(get().source.text);
    if (!parsed.ok) {
      set((state) => {
        const source = classifySourceDraft(state.source, state.world, state.revision, state.source.text);
        persistSourceRecovery(source);
        return { source };
      });
      return;
    }
    const formattedText = `${JSON.stringify(parsed.value, null, 2)}\n`;
    set((state) => {
      const source = classifySourceDraft(state.source, state.world, state.revision, formattedText);
      persistSourceRecovery(source);
      return { source };
    });
  },
  applySource: (options) => {
    const startedAt = now();
    const state = get();
    if (state.source.isStale && !options?.forceIfStale) {
      const issue = {
        id: "source.stale",
        severity: "warning",
        category: "structure",
        code: "source.stale",
        message: "World changed elsewhere while this source draft was open. Reload from world or Apply anyway to replace newer visual changes.",
        path: [],
        blocking: true,
      } satisfies ValidationIssue;
      set((current) => ({
        source: { ...current.source, structuralIssues: [issue] },
      }));
      recordTelemetryEvent({
        name: "source.apply",
        revision: state.revision,
        durationMs: elapsedSince(startedAt),
        result: "blocked",
        counts: { stale: 1 },
      });
      return { ok: false, reason: "stale", issues: [issue] };
    }

    const parsed = parseJsonSource(state.source.text);
    if (!parsed.ok) {
      const syntaxIssues = parsed.issues.filter((issue) => issue.category === "syntax");
      const structuralIssues = parsed.issues.filter((issue) => issue.category !== "syntax");
      set((current) => ({
        source: {
          ...current.source,
          status: structuralIssues.length > 0 ? "cannot-apply" : "invalid",
          syntaxIssues,
          structuralIssues,
        },
      }));
      recordTelemetryEvent({
        name: "source.apply",
        revision: state.revision,
        durationMs: elapsedSince(startedAt),
        result: "blocked",
        counts: issueCounts(parsed.issues),
      });
      return { ok: false, reason: structuralIssues.length > 0 ? "blocking-issues" : "syntax", issues: parsed.issues };
    }

    const validation = validateUnknownWorld(parsed.value);
    if (!validation.ok) {
      set((current) => ({
        source: {
          ...current.source,
          status: "cannot-apply",
          syntaxIssues: [],
          structuralIssues: validation.issues,
        },
      }));
      recordTelemetryEvent({
        name: "source.apply",
        revision: state.revision,
        durationMs: elapsedSince(startedAt),
        result: "blocked",
        counts: issueCounts(validation.issues),
      });
      return { ok: false, reason: "blocking-issues", issues: validation.issues };
    }

    const nextRevision = state.revision + 1;
    const nextWorld = validation.world;
    const nextText = serializeWorld(nextWorld);
    if (nextText === serializeWorld(state.world)) {
      set({
        issues: validation.issues,
        source: {
          text: nextText,
          baseRevision: state.revision,
          status: "synced",
          isStale: false,
          syntaxIssues: [],
          structuralIssues: [],
        },
      });
      clearSourceDraftRecovery();
      recordTelemetryEvent({
        name: "source.apply",
        revision: state.revision,
        durationMs: elapsedSince(startedAt),
        result: "ok",
        counts: issueCounts(validation.issues),
      });
      return { ok: true, revision: state.revision };
    }
    const nextIndex = buildWorldIndex(nextWorld);
    const nextSelection = reconcileSelection(state.selection, nextWorld, nextIndex);
    set({
      world: nextWorld,
      revision: nextRevision,
      history: pushHistory(state.history, state.world),
      selection: nextSelection,
      expandedNodeIds: expandedForSelection(state.expandedNodeIds, nextSelection, nextWorld),
      issues: validation.issues,
      source: {
        text: nextText,
        baseRevision: nextRevision,
        status: "synced",
        isStale: false,
        syntaxIssues: [],
        structuralIssues: [],
      },
    });
    clearSourceDraftRecovery();
    savePersistedWorldSnapshot(nextWorld, nextRevision);
    recordTelemetryEvent({
      name: "source.apply",
      revision: nextRevision,
      durationMs: elapsedSince(startedAt),
      result: "ok",
      counts: issueCounts(validation.issues),
    });
    recordCommandJournalEntry({
      revision: nextRevision,
      commandKind: "source.apply",
      affectedIds: [],
      result: "ok",
      issueCounts: issueCounts(validation.issues),
    });
    return { ok: true, revision: nextRevision };
  },
  undo: () => {
    const state = get();
    const previous = state.history.past.at(-1);
    if (!previous) return;
    const past = state.history.past.slice(0, -1);
    const future = [state.world, ...state.history.future];
    const selection = reconcileSelection(state.selection, previous);
    const revision = state.revision + 1;
    const issues = validateCommittedWorld(previous);
    set({
      world: previous,
      revision,
      history: { ...state.history, past, future },
      selection,
      issues,
      source: syncOrStaleSource(state.source, previous, revision),
    });
    persistSourceRecovery(get().source);
    savePersistedWorldSnapshot(previous, revision);
    recordTelemetryEvent({ name: "history.undo", revision, result: "ok", counts: issueCounts(issues) });
    recordCommandJournalEntry({
      revision,
      commandKind: "history.undo",
      affectedIds: [],
      result: "ok",
      issueCounts: issueCounts(issues),
    });
  },
  redo: () => {
    const state = get();
    const next = state.history.future[0];
    if (!next) return;
    const future = state.history.future.slice(1);
    const past = boundedHistory([...state.history.past, state.world], state.history.limit);
    const selection = reconcileSelection(state.selection, next);
    const revision = state.revision + 1;
    const issues = validateCommittedWorld(next);
    set({
      world: next,
      revision,
      history: { ...state.history, past, future },
      selection,
      issues,
      source: syncOrStaleSource(state.source, next, revision),
    });
    persistSourceRecovery(get().source);
    savePersistedWorldSnapshot(next, revision);
    recordTelemetryEvent({ name: "history.redo", revision, result: "ok", counts: issueCounts(issues) });
    recordCommandJournalEntry({
      revision,
      commandKind: "history.redo",
      affectedIds: [],
      result: "ok",
      issueCounts: issueCounts(issues),
    });
  },
  setPlacementType: (type) => set({ placementType: type }),
  createEntity: (sceneId, type, position) => {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    const state = get();
    const index = buildWorldIndex(state.world);
    const name = `New ${contentTypeRegistry[type].label}`;
    const id = createReadableEntityId(type, name, index);
    const world = createEntityInWorld(state.world, sceneId, type, position, id, name);
    get().commitWorld(world, { kind: "entity", sceneId, entityId: id }, {
      commandKind: "entity.create",
      affectedIds: [sceneId, id],
    });
    set({ placementType: null });
  },
  createScene: () => {
    const state = get();
    const index = buildWorldIndex(state.world);
    const sceneName = `Scene ${state.world.scenes.length + 1}`;
    const sceneId = createReadableSceneId(sceneName, index);
    const nextWorld = createSceneInWorld(state.world, sceneId, sceneName, { width: 1_200, height: 800 });
    get().commitWorld(nextWorld, { kind: "scene", sceneId }, {
      commandKind: "scene.create",
      affectedIds: [sceneId],
    });
  },
  deleteScene: (sceneId) => {
    const state = get();
    const preferredSelection = selectionAfterSceneDelete(state.selection, state.world, sceneId);
    get().commitWorld(deleteSceneInWorld(state.world, sceneId), preferredSelection, {
      commandKind: "scene.delete",
      affectedIds: [sceneId],
    });
  },
  duplicateScene: (sceneId) => {
    const state = get();
    const index = buildWorldIndex(state.world);
    const source = index.scenesById.get(sceneId);
    if (!source) return;
    const newSceneId = createReadableSceneId(`${source.name} Copy`, index);
    const entityIdMap = createDuplicatedSceneEntityIdMap(source.entities, index, newSceneId);
    get().commitWorld(duplicateSceneInWorld(state.world, sceneId, newSceneId, entityIdMap), { kind: "scene", sceneId: newSceneId }, {
      commandKind: "scene.duplicate",
      affectedIds: [sceneId, newSceneId, ...Object.values(entityIdMap)],
    });
  },
  deleteEntity: (entityId) => {
    const state = get();
    get().commitWorld(deleteEntityInWorld(state.world, entityId), state.selection, {
      commandKind: "entity.delete",
      affectedIds: [entityId],
    });
  },
  duplicateEntity: (entityId) => {
    const state = get();
    const index = buildWorldIndex(state.world);
    const source = index.entitiesById.get(entityId);
    const sceneId = index.sceneIdByEntityId.get(entityId);
    if (!source || !sceneId) return;
    const id = createReadableEntityId(source.type, `${source.name} Copy`, index);
    get().commitWorld(duplicateEntityInWorld(state.world, entityId, id), { kind: "entity", sceneId, entityId: id }, {
      commandKind: "entity.duplicate",
      affectedIds: [entityId, id],
    });
  },
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),
  toggleNodeExpanded: (nodeId) =>
    set((state) => ({
      expandedNodeIds: {
        ...state.expandedNodeIds,
        [nodeId]: !state.expandedNodeIds[nodeId],
      },
    })),
  revealSourceForSelection: (selection) =>
    set((state) => {
      const path = sourcePathForSelection(state.world, selection);
      if (!path) return {};
      return {
        activeBottomTab: "source",
        sourceNavigation: {
          path,
          target: sourceTargetForSelection(selection),
          requestId: (state.sourceNavigation?.requestId ?? 0) + 1,
        },
      };
    }),
  revealSourcePath: (path, options) =>
    set((state) => ({
      activeBottomTab: "source",
      sourceNavigation: {
        path,
        ...(options?.target ? { target: options.target } : {}),
        ...(options?.sourceRange ? { sourceRange: options.sourceRange } : {}),
        requestId: (state.sourceNavigation?.requestId ?? 0) + 1,
      },
    })),
  focusIssue: (issueId) =>
    set((state) => ({
      focusedIssue: {
        issueId,
        requestId: (state.focusedIssue?.requestId ?? 0) + 1,
      },
    })),
  setSceneCamera: (sceneId, camera) =>
    set((state) => {
      const current = state.camerasBySceneId[sceneId];
      if (current && current.x === camera.x && current.y === camera.y && current.zoom === camera.zoom) return {};
      return {
        camerasBySceneId: {
          ...state.camerasBySceneId,
          [sceneId]: camera,
        },
      };
    }),
  commitWorld: (nextWorld: WorldDocument, preferredSelection: Selection, options: CommitWorldOptions) => {
    const startedAt = now();
    const state = get();
    if (serializeWorld(nextWorld) === serializeWorld(state.world)) return;
    const nextRevision = state.revision + 1;
    const nextSelection = reconcileSelection(preferredSelection, nextWorld);
    const issues = validateCommittedWorld(nextWorld);
    set({
      world: nextWorld,
      revision: nextRevision,
      history: pushHistory(state.history, state.world),
      selection: nextSelection,
      expandedNodeIds: expandedForSelection(state.expandedNodeIds, nextSelection, nextWorld),
      issues,
      source: syncOrStaleSource(state.source, nextWorld, nextRevision),
    });
    persistSourceRecovery(get().source);
    savePersistedWorldSnapshot(nextWorld, nextRevision);
    recordTelemetryEvent({
      name: options.commandKind,
      revision: nextRevision,
      durationMs: elapsedSince(startedAt),
      result: "ok",
      counts: issueCounts(issues),
    });
    recordCommandJournalEntry({
      revision: nextRevision,
      commandKind: options.commandKind,
      affectedIds: options.affectedIds ?? [],
      result: "ok",
      issueCounts: issueCounts(issues),
    });
  },
}));

function maybeSnap(position: Position, enabled: boolean, gridSize: number): Position {
  if (!enabled || gridSize <= 0) return position;
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}

function selectionAfterSceneDelete(selection: Selection, world: WorldDocument, sceneId: string): Selection {
  if ((selection.kind !== "scene" && selection.kind !== "entity") || selection.sceneId !== sceneId) {
    return selection;
  }

  const sceneIndex = world.scenes.findIndex((scene) => scene.id === sceneId);
  const fallbackScene = world.scenes[sceneIndex + 1] ?? world.scenes[sceneIndex - 1];
  return fallbackScene ? { kind: "scene", sceneId: fallbackScene.id } : { kind: "world" };
}

function createDuplicatedSceneEntityIdMap(
  entities: WorldDocument["scenes"][number]["entities"],
  index: WorldIndex,
  newSceneId: string,
): Record<string, string> {
  const reservedIndex: WorldIndex = {
    scenesById: new Map(index.scenesById),
    entitiesById: new Map(index.entitiesById),
    sceneIdByEntityId: new Map(index.sceneIdByEntityId),
    entityIdsBySceneId: new Map(index.entityIdsBySceneId),
  };
  reservedIndex.scenesById.set(newSceneId, {
    id: newSceneId,
    name: newSceneId,
    bounds: { width: 1, height: 1 },
    entities: [],
  });

  const entityIdMap: Record<string, string> = {};
  for (const entity of entities) {
    const nextId = createReadableEntityId(entity.type, `${entity.name} Copy`, reservedIndex);
    entityIdMap[entity.id] = nextId;
    reservedIndex.entitiesById.set(nextId, entity);
    reservedIndex.sceneIdByEntityId.set(nextId, newSceneId);
  }
  return entityIdMap;
}

function defaultExpanded(world: WorldDocument): Record<string, boolean> {
  const expanded: Record<string, boolean> = { world: true, scenes: true };
  for (const scene of world.scenes) {
    expanded[`scene:${scene.id}`] = true;
    for (const type of Object.keys(contentTypeRegistry)) {
      expanded[`group:${scene.id}:${type}`] = true;
    }
    expanded[`group:${scene.id}:unsupported`] = true;
  }
  return expanded;
}

function expandedForSelection(expanded: Record<string, boolean>, selection: Selection, world: WorldDocument): Record<string, boolean> {
  const next = { ...defaultExpanded(world), ...expanded };
  if (selection.kind === "scene") {
    next[`scene:${selection.sceneId}`] = true;
  }
  if (selection.kind === "entity") {
    const index = buildWorldIndex(world);
    const entity = index.entitiesById.get(selection.entityId);
    next[`scene:${selection.sceneId}`] = true;
    next[`group:${selection.sceneId}:${entityGroupKey(entity?.type)}`] = true;
  }
  return next;
}

function sourcePathForSelection(world: WorldDocument, selection: Selection): SourcePath | null {
  if (selection.kind === "world") return [];
  const sceneIndex = world.scenes.findIndex((scene) => scene.id === selection.sceneId);
  if (sceneIndex < 0) return null;
  if (selection.kind === "scene") return ["scenes", sceneIndex];

  const entityIndex = world.scenes[sceneIndex]?.entities.findIndex((entity) => entity.id === selection.entityId) ?? -1;
  return entityIndex >= 0 ? ["scenes", sceneIndex, "entities", entityIndex] : null;
}

function sourceTargetForSelection(selection: Selection): SourceNavigationTarget {
  if (selection.kind === "scene") return { kind: "scene", sceneId: selection.sceneId };
  if (selection.kind === "entity") return { kind: "entity", entityId: selection.entityId };
  return { kind: "world" };
}

function entityGroupKey(type: string | undefined): string {
  return type && isSupportedType(type) ? type : "unsupported";
}

function persistSourceRecovery(source: SourceState): void {
  if (source.status === "synced" && !source.isStale) {
    clearSourceDraftRecovery();
    return;
  }
  saveSourceDraftRecovery(source.text, source.baseRevision);
}

function issueCounts(issues: ValidationIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
  };
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function elapsedSince(startedAt: number): number {
  return now() - startedAt;
}

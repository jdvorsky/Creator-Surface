# Design Notes

Creator Surface is a vertical slice of a production authoring tool. The product goal is not to maximize features; it is to prove that four views can behave like one editor without losing creator data.

## Source Of Truth

The committed `world` in the Zustand store is the only source of truth for authored data. The scene graph, SVG map, Properties inspector, Source JSON editor, Problems panel, toolbar counts, and local persistence are all projections of that document.

Editor-only state is kept separate: selection, expanded tree nodes, map cameras, placement mode, source draft status, stale-source flags, panel state, history, and transient drag previews are never serialized into world JSON.

All world mutations go through store actions and domain commands. Commands return new immutable documents, reconcile selection, update validation, and create deliberate undo boundaries only when data actually changes.

## World Model

The document starts at `schemaVersion: 1` and contains scenes with bounds and spatial entities. Supported entity types are:

- `location`
- `character`
- `item`
- `portal`

The registry in `src/domain/contentTypes.ts` owns labels, creation defaults, glyph choices, type-specific data schemas, metadata schemas, and semantic validation. Unknown fields are preserved. Unknown entity types are committed when their base shape is safe, rendered as fallback glyphs, and reported as actionable unsupported-type issues.

Portal targets live at `entity.data.target` and can reference a scene or any entity in the world. Broken portal references are committed as recoverable errors so a creator can repair them incrementally.

## Source JSON Safety

The Source panel owns a draft string. Typing in Source never mutates the committed world. Apply follows a strict path:

1. parse JSON
2. detect duplicate object keys before parse results can overwrite data
3. run structural and identity validation
4. block unsafe documents without changing the committed world
5. commit a safe document atomically
6. reconcile selection and refresh every projection

Syntax errors, duplicate IDs, malformed required containers, invalid scene bounds, and invalid finite positions are blocking. Broken references, unsupported types, invalid known metadata, duplicate tags, and out-of-bounds positions are nonblocking committed-world issues when the entity remains addressable and renderable.

Dirty source drafts are never silently overwritten. If a visual edit changes the world while Source is dirty, the draft becomes stale. The UI offers Reload from world or a confirmed Apply anyway flow.

## Interaction Model

The desktop layout uses resizable panels. The graph supports keyboard traversal. The map uses plain SVG, pointer drag for spatial movement, keyboard nudging for selected glyphs, and a shared command path for drag and Properties edits.

Properties intentionally edits only placement fields: name, type, and position. Rich type-specific details remain Source-first so unknown data can round-trip without a form silently deleting it. Name fields use local drafts and commit on Enter or blur, so undo history does not record every keystroke.

Undo and redo are available from the toolbar and keyboard shortcuts. Ctrl/Cmd+Z and redo are scoped to the world editor only when focus is outside native fields and CodeMirror, allowing text editors to keep their own undo stacks.

## Validation And Problems

Validation emits stable `ValidationIssue` objects with severity, category, code, path, blocking status, and optional scene/entity IDs. The Problems panel separates source-draft diagnostics from committed-world issues, groups issues by severity and scene, and navigates to the affected scene, entity, or source location.

The map never silently omits addressable content. Fully supported entities render with type-specific glyphs. Fallback-represented content remains selectable and receives a problem row explaining what fidelity was lost.

## Local Readiness

Local persistence stores only validated committed-world snapshots and separate source draft recovery. On page load, saved data is offered through an explicit restore banner instead of replacing the sample world automatically.

Diagnostics are local-only. The export includes privacy flags, bounded telemetry summaries, and command journal summaries with affected counts, not world JSON, source text, authored IDs, names, or metadata.

Automated coverage is split by layer:

- domain tests for validation, commands, IDs, selection, and source location
- store tests for atomic apply, stale drafts, history, recovery, and no-op behavior
- React tests for synchronized surfaces, accessibility states, toolbar flows, and recovery UI
- Playwright tests for reviewer workflows in Chromium and WebKit

## Agentic Implementation Workflow

My six-hour agentic workflow worked through tight verification loops rather than a single long implementation pass. I started by freezing the acceptance contract, then asked parallel agents to inspect separate risk areas: source-of-truth/state transitions, validation coverage, synchronized UI behavior, accessibility, and end-to-end reviewer flows. Each agent returned factual gaps with file references and suggested tests, not broad opinions.

Implementation then proceeded in small loops: choose one high-value gap, patch it, add or update the smallest proving test, run the relevant subset, and then continue. The main agent would own integration and product judgment, keeping optional polish from weakening P0 data-safety behavior. Near the end, the loop switched from feature work to release hardening: full `npm run check`, cross-browser Playwright, docs trimming, and a clean submission depot with only reviewer-facing history.

This workflow uses the token budget for early coverage and contradiction detection, then spends the final window on convergence: fewer changes, stronger tests, and playtest-generated QoL. 


The main commands are documented in `README.md`.

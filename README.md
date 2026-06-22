# Creator Surface

Creator Surface is a local, in-browser world editor built with React, TypeScript, Vite, Zustand, Immer, Zod, CodeMirror, SVG, Vitest, Testing Library, and Playwright.

The editor presents one committed world document through four synchronized surfaces:

- scene graph
- spatial SVG map
- minimal Properties inspector
- editable JSON source
- Problems panel for source and committed-world diagnostics

Authoring data lives in one canonical `world` document. Visual edits, source applies, undo/redo, validation, local recovery, and diagnostics all route through the same store and command boundaries.

## Run Locally

Use Node `>=18.18.0` and npm `>=9`.

```bash
npm install
npm run dev
```

Open the Vite URL printed by the dev server, usually `http://127.0.0.1:5173`.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run test:e2e
```

`npm run check` runs type checking, linting, Vitest, and a production build. `npm run test:e2e` runs the browser reviewer workflows in Chromium and WebKit. If Playwright browsers are missing, run:

```bash
npx playwright install chromium webkit
```

For the full local release pass:

```bash
npm run check:release
```

## Reviewer Path

1. Start the app with `npm run dev`.
2. Select scenes and entities in the scene graph and confirm the map, Properties, Source JSON, and Problems panel follow the same selection.
3. Drag the Sunken Compass item on the Harbor District map and confirm its JSON position updates.
4. Edit an entity name in Properties and press Enter or blur the field to commit it as one history step.
5. Edit an entity position in Properties and press Enter to commit it.
6. Change a portal target in Source JSON, apply it, and confirm the graph summary and Problems panel update.
7. Paste invalid JSON and apply it; the last committed world should remain visible.
8. Create a broken portal reference, apply it, then click the problem row to navigate to the affected source field.
9. Delete or duplicate a scene or entity and use undo/redo buttons or Ctrl/Cmd+Z and redo outside Source JSON.
10. Reload after a committed visual edit and use the restore banner to load the saved local world.
11. Download diagnostics and confirm the export contains command/telemetry summaries, not world JSON, source text, names, metadata, or authored IDs.

## Intentional Boundaries

This is a local editor, not a game engine or collaboration platform. There is no backend, authentication, networking, multiplayer, pathfinding, canvas, WebGL, or remote telemetry.

Unknown entity types and unknown JSON fields are preserved. Unsupported but addressable entities stay visible with fallback glyphs and actionable validation issues. Invalid source drafts are allowed, but applying a draft is atomic and never corrupts the last committed world.

See `DESIGN.md` for the architecture and validation writeup.

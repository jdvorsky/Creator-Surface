import { describe, expect, it } from "vitest";
import { buildDiagnosticsSnapshot } from "./diagnostics";
import { getCommandJournalEntries, recordCommandJournalEntry } from "./changeJournal";
import { getTelemetryEvents, recordTelemetryEvent } from "./telemetry";

describe("local telemetry and command journal", () => {
  it("stores bounded editor telemetry without creator-authored payload fields", () => {
    for (let revision = 0; revision < 105; revision += 1) {
      recordTelemetryEvent({
        name: "source.apply",
        revision,
        result: revision % 2 === 0 ? "ok" : "blocked",
        counts: { errors: revision % 3 },
      });
    }

    const events = getTelemetryEvents();
    expect(events).toHaveLength(100);
    expect(events[0]?.revision).toBe(5);
    expect(events.at(-1)).toMatchObject({ name: "source.apply", revision: 104, result: "ok" });
    expect(JSON.stringify(events)).not.toContain("world");
    expect(JSON.stringify(events)).not.toContain("metadata");
  });

  it("stores bounded command journal entries with revision, command kind, affected IDs, and validation result", () => {
    for (let revision = 0; revision < 105; revision += 1) {
      recordCommandJournalEntry({
        revision,
        commandKind: "entity.rename",
        affectedIds: [`entity_${revision}`],
        result: "ok",
        issueCounts: { errors: 0, warnings: revision % 2 },
      });
    }

    const entries = getCommandJournalEntries();
    expect(entries).toHaveLength(100);
    expect(entries[0]).toMatchObject({
      revision: 5,
      commandKind: "entity.rename",
      affectedIds: ["entity_5"],
      result: "ok",
      issueCounts: { errors: 0, warnings: 1 },
    });
  });

  it("exports a diagnostics summary with explicit local-only privacy guarantees", () => {
    recordTelemetryEvent({ name: "world.export", revision: 1, result: "ok" });
    recordCommandJournalEntry({
      revision: 1,
      commandKind: "world.export",
      affectedIds: [],
      result: "ok",
      issueCounts: { errors: 0, warnings: 0 },
    });

    expect(buildDiagnosticsSnapshot()).toMatchObject({
      kind: "creator-surface.diagnostics",
      version: 1,
      privacy: {
        transport: "none",
        includesWorldJson: false,
        includesSourceText: false,
        includesNamesOrMetadata: false,
        includesAuthorIds: false,
      },
      telemetry: [expect.objectContaining({ name: "world.export" })],
      commandJournal: [expect.objectContaining({ commandKind: "world.export", affectedCount: 0 })],
    });
  });

  it("redacts affected authored IDs from diagnostics command journal entries", () => {
    recordCommandJournalEntry({
      revision: 2,
      commandKind: "entity.rename",
      affectedIds: ["character_mira"],
      result: "ok",
      issueCounts: { errors: 0, warnings: 0 },
    });

    const diagnostics = buildDiagnosticsSnapshot();

    expect(diagnostics.commandJournal).toEqual([
      expect.objectContaining({
        commandKind: "entity.rename",
        affectedCount: 1,
        result: "ok",
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("character_mira");
  });
});

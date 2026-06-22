import { getCommandJournalEntries } from "./changeJournal";
import { APP_VERSION } from "./localPersistence";
import { getTelemetryEvents } from "./telemetry";

export function buildDiagnosticsSnapshot() {
  return {
    kind: "creator-surface.diagnostics",
    version: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    privacy: {
      transport: "none",
      includesWorldJson: false,
      includesSourceText: false,
      includesNamesOrMetadata: false,
      includesAuthorIds: false,
    },
    telemetry: getTelemetryEvents(),
    commandJournal: getCommandJournalEntries().map(({ affectedIds, at, commandKind, issueCounts, result, revision }) => ({
      at,
      revision,
      commandKind,
      affectedCount: affectedIds.length,
      result,
      issueCounts,
    })),
  };
}

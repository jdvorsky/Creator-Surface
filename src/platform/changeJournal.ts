export interface CommandJournalEntry {
  id: string;
  at: string;
  revision: number;
  commandKind: string;
  affectedIds: string[];
  result: "ok" | "blocked" | "error";
  issueCounts: {
    errors: number;
    warnings: number;
  };
}

const JOURNAL_LIMIT = 100;
let entries: CommandJournalEntry[] = [];

export function recordCommandJournalEntry(entry: Omit<CommandJournalEntry, "id" | "at"> & { id?: string; at?: string }): CommandJournalEntry {
  const next: CommandJournalEntry = {
    id: entry.id ?? `journal:${entry.revision}:${entry.commandKind}:${entries.length + 1}`,
    at: entry.at ?? new Date().toISOString(),
    revision: entry.revision,
    commandKind: entry.commandKind,
    affectedIds: [...entry.affectedIds],
    result: entry.result,
    issueCounts: { ...entry.issueCounts },
  };
  entries = [...entries, next].slice(-JOURNAL_LIMIT);
  return next;
}

export function getCommandJournalEntries(): CommandJournalEntry[] {
  return entries.map((entry) => ({
    ...entry,
    affectedIds: [...entry.affectedIds],
    issueCounts: { ...entry.issueCounts },
  }));
}

export function clearCommandJournalEntries(): void {
  entries = [];
}

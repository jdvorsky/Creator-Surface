import type { WorldDocument } from "../domain/model";

export interface HistoryState {
  past: WorldDocument[];
  future: WorldDocument[];
  limit: number;
}

export function pushHistory(history: HistoryState, world: WorldDocument): HistoryState {
  return {
    past: boundedHistory([...history.past, structuredClone(world)], history.limit),
    future: [],
    limit: history.limit,
  };
}

export function boundedHistory(worlds: WorldDocument[], limit: number): WorldDocument[] {
  return worlds.slice(Math.max(0, worlds.length - limit));
}

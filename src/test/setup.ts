import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { clearCommandJournalEntries } from "../platform/changeJournal";
import { clearTelemetryEvents } from "../platform/telemetry";

beforeEach(() => {
  window.localStorage.clear();
  clearCommandJournalEntries();
  clearTelemetryEvents();
});

if (!URL.createObjectURL) {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:mock-url",
  });
}

if (!URL.revokeObjectURL) {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
}

if (typeof Range !== "undefined") {
  if (!Range.prototype.getClientRects) {
    Object.defineProperty(Range.prototype, "getClientRects", {
      value: () => [],
    });
  }
  if (!Range.prototype.getBoundingClientRect) {
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      value: () => ({
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });
  }
}

import { ErrorBoundary } from "./ErrorBoundary";
import { EditorShell } from "./EditorShell";

export function App() {
  return (
    <ErrorBoundary>
      <EditorShell />
    </ErrorBoundary>
  );
}

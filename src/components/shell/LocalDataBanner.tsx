import { useEffect } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useConfirmDialog } from "../common/ConfirmDialog";

export function LocalDataBanner() {
  const localData = useEditorStore((state) => state.localData);
  const detectLocalData = useEditorStore((state) => state.detectLocalData);
  const restorePersistedWorld = useEditorStore((state) => state.restorePersistedWorld);
  const resetToSampleWorld = useEditorStore((state) => state.resetToSampleWorld);
  const restoreSourceDraft = useEditorStore((state) => state.restoreSourceDraft);
  const discardSourceDraft = useEditorStore((state) => state.discardSourceDraft);
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    detectLocalData();
  }, [detectLocalData]);

  if (!localData.persistedWorld && !localData.draftRecovery) return null;

  const confirmResetToSample = () => {
    void confirm({
      title: "Reset to sample world?",
      message: "This clears saved local world and draft recovery data, then restores the built-in sample world.",
      confirmLabel: "Reset to sample",
      destructive: true,
    }).then((confirmed) => {
      if (confirmed) resetToSampleWorld();
    });
  };

  return (
    <section className="local-data-banner" aria-label="Local recovery options">
      {localData.persistedWorld ? (
        <div className="local-data-message">
          <span>Saved local world from {formatDate(localData.persistedWorld.savedAt)} is available.</span>
          <div className="mini-actions">
            <button type="button" className="primary-button" onClick={restorePersistedWorld}>
              Use saved world
            </button>
            <button type="button" className="text-button" onClick={confirmResetToSample}>
              Reset to sample
            </button>
          </div>
        </div>
      ) : null}
      {localData.draftRecovery ? (
        <div className="local-data-message">
          <span>Recovered source draft from {formatDate(localData.draftRecovery.savedAt)} is available.</span>
          <div className="mini-actions">
            <button type="button" className="text-button" onClick={restoreSourceDraft}>
              Restore draft
            </button>
            <button type="button" className="text-button" onClick={discardSourceDraft}>
              Discard draft
            </button>
          </div>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "local storage";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

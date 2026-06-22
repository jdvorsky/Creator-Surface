import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PendingConfirmation extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

export function useConfirmDialog() {
  const titleId = useId();
  const messageId = useId();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPending({ ...options, resolve });
    });
  }, []);

  useEffect(() => {
    if (!pending) return undefined;
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [pending]);

  useEffect(() => {
    if (!pending) return undefined;
    const backgroundRoots = Array.from(document.querySelectorAll<HTMLElement>("[data-modal-background]"));
    const previousState = backgroundRoots.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.hasAttribute("inert"),
    }));

    for (const element of backgroundRoots) {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("inert", "");
    }

    const keepFocusInDialog = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialogRef.current?.contains(target)) return;
      window.setTimeout(() => focusFirstDialogControl(dialogRef.current), 0);
    };

    document.addEventListener("focusin", keepFocusInDialog, true);

    return () => {
      document.removeEventListener("focusin", keepFocusInDialog, true);
      for (const { element, ariaHidden, inert } of previousState) {
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
        if (inert) {
          element.setAttribute("inert", "");
        } else {
          element.removeAttribute("inert");
        }
      }
    };
  }, [pending]);

  const close = useCallback(
    (confirmed: boolean) => {
      const current = pending;
      if (!current) return;
      const returnTarget = returnFocusRef.current;
      setPending(null);
      current.resolve(confirmed);
      window.setTimeout(() => {
        if (returnTarget?.isConnected) returnTarget.focus();
        returnFocusRef.current = null;
      }, 0);
    },
    [pending],
  );

  const dialogContent = pending ? (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => close(false)}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close(false);
            return;
          }
          if (event.key === "Tab") {
            const focusable = getFocusableElements(dialogRef.current);
            const first = focusable[0];
            const last = focusable.at(-1);
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h3 id={titleId}>{pending.title}</h3>
        <p id={messageId}>{pending.message}</p>
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="text-button" onClick={() => close(false)}>
            {pending.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={pending.destructive ? "primary-button danger-primary" : "primary-button"}
            onClick={() => close(true)}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;
  const dialog = dialogContent ? createPortal(dialogContent, document.body) : null;

  return { confirm, dialog };
}

function focusFirstDialogControl(root: HTMLElement | null): void {
  const [first] = getFocusableElements(root);
  (first ?? root)?.focus();
}

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("aria-hidden") && !element.closest("[inert]"));
}

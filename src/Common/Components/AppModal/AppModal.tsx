import { useCallback, useEffect, useRef, useState } from "react";
import { useExternalLink, type PendingLink } from "../../../Services/externalLink";

// Keep in sync with app.scss's .app-modal.is-closing animation duration.
const CLOSE_ANIMATION_MS = 180;

/**
 * Confirm-before-leaving dialog for outbound links. Mounted once at the app root; every
 * ExternalLink (and every external <a> inside rendered markdown) funnels through it.
 */
export default function AppModal() {
  const { pending, clear } = useExternalLink();

  // The dialog has to outlive `pending` by one animation. Rather than mirroring pending into
  // state (which would mean writing state from an effect on every open), the link being closed is
  // stashed here on the way out — so what's on screen is derived, not synchronised.
  const [closingLink, setClosingLink] = useState<PendingLink | null>(null);

  const shown = pending ?? closingLink;
  const closing = pending === null && closingLink !== null;

  const cancelRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    if (!pending) return; // already closing
    setClosingLink(pending);
    clear();
    closeTimer.current = window.setTimeout(() => setClosingLink(null), CLOSE_ANIMATION_MS);
  }, [pending, clear]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    []
  );

  // Focus the safe action, and keep Tab/Shift+Tab cycling within the dialog's own focusable
  // elements instead of escaping into the page behind the overlay.
  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;

      const container = modalRef.current;
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>("button, a[href], [tabindex]")
      ).filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex !== -1);
      if (focusables.length === 0) return;

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, close]);

  if (!shown) return null;

  const confirm = () => {
    window.open(shown.url, "_blank", "noopener,noreferrer");
    close();
  };

  return (
    <div className={`app-modal-overlay ${closing ? "is-closing" : ""}`.trim()} onClick={close}>
      <div
        className={`app-modal ${closing ? "is-closing" : ""}`.trim()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="app-modal-kicker">leaving nuka.works</p>
        <h2 className="app-modal-title" id="app-modal-title">
          {shown.label}
        </h2>
        <p className="app-modal-message">You&apos;re about to open an external link outside this site.</p>
        <p className="app-modal-url">{shown.url}</p>
        <div className="app-modal-actions">
          <button type="button" className="app-modal-btn" ref={cancelRef} onClick={close}>
            cancel
          </button>
          <button type="button" className="app-modal-btn app-modal-btn-confirm" onClick={confirm}>
            continue
          </button>
        </div>
      </div>
    </div>
  );
}

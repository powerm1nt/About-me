import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Overflowing } from "../../Hooks/useOverflow";
import Anchored from "../Anchored/Anchored";

/**
 * The red edge where a board is cutting its contents off, and the explanation attached to it.
 *
 * The message shows itself when the overflow appears, because something being silently clipped is
 * exactly the case where waiting to be asked is wrong. Once dismissed it stays out of the way, and
 * the edge brings it back on hover — the mark is permanent, the notice is not.
 */
export default function OverflowWarning({
  axis,
  scrollable,
}: {
  axis: Overflowing;
  scrollable: boolean;
}) {
  const { t } = useTranslation();
  const edge = useRef<HTMLSpanElement>(null);
  // Which axis the notice was dismissed for, rather than a plain flag: a new overflow, or one that
  // has changed axis, is worth saying again, and deriving that beats resetting it from an effect.
  const [dismissedFor, setDismissedFor] = useState<Overflowing | null>(null);
  const [hovered, setHovered] = useState(false);

  const dismissed = dismissedFor === axis;
  const shown = !dismissed || hovered;

  return (
    <>
      <span
        className="overflow-edge"
        ref={edge}
        data-axis={axis}
        aria-hidden="true"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {shown && (
        <Anchored anchor={edge} align="right" className="overflow-tip" gap={8}>
          <div role="status">
            <p className="overflow-tip-title">
              {t("overflow.title")}
              {!dismissed && (
                <button
                  type="button"
                  className="overflow-tip-close"
                  aria-label={t("board.cancel")}
                  onClick={() => setDismissedFor(axis)}
                >
                  ✕
                </button>
              )}
            </p>
            <p className="overflow-tip-body">{t(`overflow.${axis}`)}</p>
            <p className="overflow-tip-body">
              {t(scrollable ? "overflow.scrollable" : "overflow.fix")}
            </p>
          </div>
        </Anchored>
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from "react";

export type Overflowing = "none" | "inline" | "block" | "both";

/** Slack for sub-pixel rounding. */
const SLACK = 2;

/**
 * Watches a board for widgets it is too small to show and cannot scroll to.
 *
 * Measured from each widget's own offset box rather than the board's scrollWidth. scrollWidth counts
 * everything sticking out, and in edit mode that includes the corner badge and the resize handle,
 * which are positioned deliberately outside their widget — so every board reported overflow the
 * moment it was edited. Offsets also ignore transforms, which keeps the edit-mode dance from
 * reporting a widget as overflowing each time it rocks.
 */
export function useOverflow(enabled: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [overflowing, setOverflowing] = useState<Overflowing>("none");

  const ref = useCallback((element: HTMLElement | null) => setNode(element), []);

  useEffect(() => {
    if (!node || !enabled) return;

    const measure = () => {
      let wide = false;
      let tall = false;

      for (const child of Array.from(node.children)) {
        if (!(child instanceof HTMLElement) || !child.classList.contains("widget")) continue;
        if (child.offsetLeft + child.offsetWidth - node.clientWidth > SLACK) wide = true;
        if (child.offsetTop + child.offsetHeight - node.clientHeight > SLACK) tall = true;
      }

      const next: Overflowing = wide && tall ? "both" : wide ? "inline" : tall ? "block" : "none";
      setOverflowing((current) => (current === next ? current : next));
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);

    return () => observer.disconnect();
  }, [node, enabled]);

  return { ref, overflowing: enabled ? overflowing : ("none" as Overflowing) };
}

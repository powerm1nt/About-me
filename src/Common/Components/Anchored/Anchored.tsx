import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface AnchoredProps {
  /** The element this floats beneath. Nothing renders until it exists. */
  anchor: RefObject<HTMLElement | null>;
  /** Which edge of the anchor the panel lines up with. */
  align?: "left" | "right";
  className?: string;
  /** Distance below the anchor, in pixels. */
  gap?: number;
  children?: ReactNode;
}

/**
 * A panel positioned under an element but rendered outside it.
 *
 * An absolutely-positioned popover inside the pivot strip could never work: that strip scrolls
 * horizontally, and `overflow-x: auto` makes `overflow-y` compute to `auto` as well, so the strip
 * clips the panel vertically and grows a scrollbar trying to contain it. No z-index fixes that —
 * clipping happens whatever the stacking order. So the panel goes to the end of <body> through a
 * portal and is positioned in viewport coordinates instead, where nothing can clip it.
 *
 * Because the position is measured rather than inherited, it has to be re-measured whenever anything
 * could have moved the anchor: scrolling (including the strip's own), and resizing.
 */
export default function Anchored({ anchor, align = "left", className, gap = 10, children }: AnchoredProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Layout effect, not effect: measuring after paint would show the panel at the top-left corner for
  // one frame before it jumped into place.
  useLayoutEffect(() => {
    const measure = () => {
      const element = anchor.current;
      setRect(element ? element.getBoundingClientRect() : null);
    };

    measure();

    // Capture phase so the pivot strip's own scrolling is heard, not just the document's.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchor]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;

    const element = anchor.current;
    if (!element) return;

    // The anchor grows as a name is typed into it, and the panel should follow rather than stay
    // where the first keystroke left it.
    const observer = new ResizeObserver(() => setRect(element.getBoundingClientRect()));
    observer.observe(element);
    return () => observer.disconnect();
  }, [anchor]);

  if (typeof document === "undefined" || rect === null) return null;

  return createPortal(
    <div
      className={className}
      style={{
        position: "fixed",
        top: `${rect.bottom + gap}px`,
        ...(align === "right"
          ? { right: `${Math.max(8, window.innerWidth - rect.right)}px` }
          : { left: `${Math.max(8, rect.left)}px` }),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

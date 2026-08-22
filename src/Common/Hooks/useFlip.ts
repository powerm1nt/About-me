import { useLayoutEffect, useRef } from "react";

/** Below this many pixels a move is not worth animating — and the edit-mode dance alone can shift a
 *  measured rect by about a pixel, which would otherwise animate on every render. */
const THRESHOLD = 2;

const DURATION = 220;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * Animates elements to their new positions after a re-render — the FLIP technique.
 *
 * Reordering a list moves elements by changing the DOM, and the DOM does not transition: an element
 * that changes place in a grid is simply painted somewhere else on the next frame. So the positions
 * are recorded (First), the render happens (Last), each element is offset back to where it used to
 * be (Invert) and then released (Play). What the eye sees is the widget sliding to its new home,
 * which is the whole point of dragging one — you are meant to watch the others make room.
 *
 * Measurement happens in a layout effect, before the browser paints, so the inverted offset is never
 * shown as a frame in the wrong place.
 *
 * Returns `node(id)`, the ref callback to attach to each animated element, and `rect(id)`, a live
 * measurement of one — a drag needs to know where things currently are, and the hook is already
 * holding the elements.
 */
export function useFlip() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    for (const [id, element] of nodes.current) {
      const next = element.getBoundingClientRect();
      const previous = positions.current.get(id);
      positions.current.set(id, next);

      // Nothing to invert from: this is the element's first appearance.
      if (!previous) continue;

      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) continue;

      // A script animation outranks the CSS one the widget is already running, and reverts to it
      // when finished — so the dance resumes on its own once the widget has landed.
      element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: DURATION, easing: EASING },
      );
    }

    // Anything unmounted since the last pass would otherwise be measured against forever.
    for (const id of positions.current.keys()) {
      if (!nodes.current.has(id)) positions.current.delete(id);
    }
  });

  return {
    node: (id: string) => (element: HTMLElement | null) => {
      if (element) nodes.current.set(id, element);
      else nodes.current.delete(id);
    },
    /** Measured now rather than read from the last pass: a drag moves things between renders. */
    rect: (id: string): DOMRect | null => nodes.current.get(id)?.getBoundingClientRect() ?? null,
  };
}

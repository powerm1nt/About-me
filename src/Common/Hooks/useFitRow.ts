import { useCallback, useEffect, useRef } from "react";

/** Below this the type is too small to read, and overflowing is the lesser problem. */
const MIN_SCALE = 0.4;

/**
 * Scales a non-scrolling row down until it fits.
 *
 * A row neither wraps nor clips, so a bar with more in it than the page is wide simply ran off the
 * edge. Wrapping is a different flow the author can choose, and scrolling is a setting they can
 * turn on; what is left is to make the contents smaller, which is what a bar of pivot labels wants
 * anyway — the strip stays one line and the words get smaller.
 *
 * The scale is published as a custom property and applied to font sizes and widths, deliberately not
 * as a transform. A transform on the row would create a stacking context and a backdrop root, which
 * is the thing that has repeatedly broken the frosting and trapped the z-indexes of anything inside.
 *
 * Measuring is done at full size and then applied, rather than measured against the scaled result:
 * shrinking changes the content width, so reading it back would chase its own tail.
 */
export function useFitRow(enabled: boolean) {
  const node = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);

  const measure = useCallback(() => {
    const element = node.current;
    if (!element) return;

    if (!enabled) {
      element.style.removeProperty("--row-fit");
      return;
    }

    // Back to full size first: the overflow has to be read at the size the content actually wants,
    // not at whatever it was last squeezed to.
    element.style.setProperty("--row-fit", "1");

    // scrollWidth reports the content's width even where nothing scrolls, which is exactly the
    // measurement wanted here.
    const available = element.clientWidth;
    const wanted = element.scrollWidth;
    if (available === 0 || wanted <= available) return;

    element.style.setProperty("--row-fit", String(Math.max(MIN_SCALE, available / wanted)));
  }, [enabled]);

  const ref = useCallback((element: HTMLElement | null) => {
    node.current = element;
  }, []);

  useEffect(() => {
    const element = node.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    // Coalesced into a frame: the observer can fire several times for one layout pass, and each
    // measurement forces one of its own.
    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        measure();
      });
    };

    schedule();

    // Only the row itself. Observing the children would mean reacting to the very sizes this sets.
    const observer = new ResizeObserver(schedule);
    observer.observe(element);

    // Web fonts land after first paint and change every width in the bar.
    document.fonts?.ready.then(schedule).catch(() => {});

    return () => {
      observer.disconnect();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  return { ref, remeasure: measure };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { applyPaletteFrom } from "../../../Services/palette";
import { resolveWallpaperUrl } from "../../../Services/wallpaper";

/**
 * Flat darkening applied over any wallpaper, however dark. The dynamic scrim added to it is tuned
 * against the photo's own luminance, not against the low-contrast secondary/muted/faint text tiers
 * sitting on it, which need headroom regardless.
 */
const BASE_SCRIM = 0.2;

/** Ceiling for the two combined, so no photo is ever darkened to solid black. */
const MAX_SCRIM = 0.85;

/**
 * The page background: today's wallpaper as a real <img> that fades in once the browser has it,
 * over the bundled fallback painted on html by app.scss.
 *
 * It is an element rather than a CSS background because background-image cannot be transitioned,
 * so swapping the URL in place shows the photo painting as its bytes arrive. An <img> reports its
 * own readiness through onLoad, which is a fact from the browser rather than something this code
 * has to infer, and fading it in is then a plain class toggle.
 */
export default function Wallpaper() {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [scrim, setScrim] = useState(BASE_SCRIM);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let active = true;

    void resolveWallpaperUrl().then((next) => {
      if (active) setUrl(next);
    });

    return () => {
      active = false;
    };
  }, []);

  const reveal = useCallback((src: string) => {
    setLoaded(true);

    // Sampling needs the pixels in a canvas, which needs its own CORS-mode request. Deliberately
    // after the reveal: the photo is already on screen, so a slow or failed sample costs the
    // visitor nothing and simply leaves the static palette from app.scss in place.
    void applyPaletteFrom(src).then((dynamicScrim) => {
      if (dynamicScrim !== null) setScrim(Math.min(dynamicScrim + BASE_SCRIM, MAX_SCRIM));
    });
  }, []);

  // A cached photo can finish decoding before React has attached onLoad, in which case that event
  // never fires and the wallpaper would stay hidden for good. `complete` is the synchronous truth
  // about an <img>, so it covers the case the event misses.
  useEffect(() => {
    if (url !== null && imgRef.current?.complete) reveal(url);
  }, [url, reveal]);

  return (
    <div className="wallpaper-layer" aria-hidden="true">
      {url !== null && (
        <img
          ref={imgRef}
          className={`wallpaper-image ${loaded ? "is-visible" : ""}`.trim()}
          src={url}
          alt=""
          decoding="async"
          onLoad={() => reveal(url)}
          // Nothing to do but stay hidden: the fallback painted on html is already behind this.
          onError={() => setLoaded(false)}
        />
      )}
      <div className="wallpaper-scrim" style={{ backgroundColor: `rgba(0, 0, 0, ${scrim})` }} />
    </div>
  );
}

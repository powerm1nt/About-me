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
  // Requested in CORS mode so the pixels can be read back out of a canvas for the palette. The
  // wallpaper endpoint sends Access-Control-Allow-Origin for exactly this reason, but a host that
  // does not would refuse the request outright, so a failure here retries without it: showing the
  // photo matters more than recoloring the chrome from it.
  const [cors, setCors] = useState(true);
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

  const reveal = useCallback((img: HTMLImageElement, sampleable: boolean) => {
    setLoaded(true);

    // Sample the element already on screen rather than the URL. Re-requesting it from script
    // would be a second cache entry in a different CORS mode, and the copy the browser served to
    // this <img> without CORS taints the canvas, which is what silently cost us the palette.
    // Deliberately after the reveal: the photo is up either way, so a failed sample costs the
    // visitor nothing and leaves the static palette from app.scss in place.
    if (!sampleable) return;

    void applyPaletteFrom(img).then((dynamicScrim) => {
      if (dynamicScrim !== null) setScrim(Math.min(dynamicScrim + BASE_SCRIM, MAX_SCRIM));
    });
  }, []);

  // A cached photo can finish decoding before React has attached onLoad, in which case that event
  // never fires and the wallpaper would stay hidden for good. `complete` is the synchronous truth
  // about an <img>, so it covers the case the event misses.
  useEffect(() => {
    const img = imgRef.current;
    if (url !== null && img?.complete) reveal(img, cors);
  }, [url, cors, reveal]);

  return (
    <div className="wallpaper-layer" aria-hidden="true">
      {url !== null && (
        <img
          // Remounts on the retry below, so the browser reissues the request in the other mode
          // instead of reusing the element's failed load.
          key={cors ? "cors" : "plain"}
          ref={imgRef}
          className={`wallpaper-image ${loaded ? "is-visible" : ""}`.trim()}
          src={url}
          alt=""
          decoding="async"
          crossOrigin={cors ? "anonymous" : undefined}
          onLoad={(event) => reveal(event.currentTarget, cors)}
          onError={() => {
            setLoaded(false);
            // One retry without CORS. If that fails too there is nothing left to try, and the
            // fallback painted on html is already behind this.
            if (cors) setCors(false);
          }}
        />
      )}
      <div className="wallpaper-scrim" style={{ backgroundColor: `rgba(0, 0, 0, ${scrim})` }} />
    </div>
  );
}

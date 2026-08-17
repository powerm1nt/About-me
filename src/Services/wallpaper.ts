import { apiUrl, assetUrl } from "./config";
import type { BingWallpaper } from "./types";
import { setCssVars } from "./palette";

/** Bundled wallpaper used when Server or Bing is unreachable, so a backend hiccup never leaves
 *  the page without a background. */
export const FALLBACK_WALLPAPER_URL = "/assets/default2.png";

/**
 * Resolves which wallpaper to show on boot: today's Bing "picture of the day", proxied through
 * Server (WallpaperController) so the browser never hotlinks bing.com directly — which also keeps
 * the image same-origin enough to sample into a canvas for the palette.
 */
export async function resolveWallpaperUrl(): Promise<string> {
  try {
    const response = await fetch(apiUrl("/api/wallpaper/bing"));
    if (response.ok) {
      const dto = (await response.json()) as BingWallpaper;
      if (dto?.imageUrl?.trim()) return dto.imageUrl;
    }
  } catch {
    // Server/Bing unreachable — fall through to the bundled static wallpaper.
  }
  return FALLBACK_WALLPAPER_URL;
}

/** Points --cardboard-url at the CDN copy so app.scss's background-image rules can reference it. */
export function injectAssetCssVariables(): void {
  setCssVars({ "--cardboard-url": `url("${assetUrl("cardboard.png")}")` });
}

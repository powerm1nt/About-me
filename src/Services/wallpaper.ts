import { apiUrl, assetUrl } from "./config";
import type { BingWallpaper } from "./types";
import { setCssVars } from "./palette";

/** Used when the API or Bing is unreachable. */
export const FALLBACK_WALLPAPER_URL = "/assets/default2.png";

/**
 * Today's Bing picture of the day, proxied through the API so the browser never hotlinks bing.com
 * and the image stays sampleable into a canvas for the palette.
 */
export async function resolveWallpaperUrl(): Promise<string> {
  try {
    const response = await fetch(apiUrl("/api/wallpaper/bing"));
    if (response.ok) {
      const dto = (await response.json()) as BingWallpaper;
      if (dto?.imageUrl?.trim()) return dto.imageUrl;
    }
  } catch {
    // Unreachable — fall through to the bundled wallpaper.
  }
  return FALLBACK_WALLPAPER_URL;
}

/** Points the asset custom properties at the CDN copies for app.scss to reference. */
export function injectAssetCssVariables(): void {
  setCssVars({ "--cardboard-url": `url("${assetUrl("cardboard.png")}")` });
}

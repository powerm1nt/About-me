import { apiUrl, assetUrl } from "./config";
import type { BingWallpaper } from "../Types";
import { setCssVars } from "./palette";

/** Used when the API or Bing is unreachable. */
export const FALLBACK_WALLPAPER_URL = "/assets/default2.png";

/**
 * Today's Bing picture of the day, proxied through the API so the browser never hotlinks bing.com
 * and the image stays sampleable into a canvas for the palette.
 */
import { getSiteHandle } from "./router";

export async function resolveWallpaperUrl(): Promise<string> {
  const handle = getSiteHandle();
  if (handle) {
    try {
      const pRes = await fetch(apiUrl(`/api/profile/${handle}`));
      if (pRes.ok) {
        const profile = await pRes.json();
        if (profile.wallpaperPath) return profile.wallpaperPath.startsWith("/") ? apiUrl(profile.wallpaperPath) : profile.wallpaperPath;
      }
    } catch {
      // A profile that will not load falls through to the default wallpaper below.
    }
  }
  try {
    const response = await fetch(apiUrl("/api/wallpaper/bing"));
    if (response.ok) {
      const dto = (await response.json()) as BingWallpaper;
      // A path from the API, resolved against the API's own origin — which in production is a
      // different host from the page.
      if (dto?.imageUrl?.trim()) return apiUrl(dto.imageUrl);
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

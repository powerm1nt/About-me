/**
 * Recolors the accent/text-tint/surface CSS custom properties to match whatever wallpaper is
 * currently set, so the palette stays coherent if the wallpaper is ever swapped at runtime
 * (settings page, per-user background, daily rotation, ...). Every derived color is checked
 * against WCAG's relative-luminance contrast formula and nudged lighter until it clears its
 * role's minimum ratio, and a wallpaper bright enough to wash out text sitting directly on it
 * gets a dark scrim layered under it — so legibility never depends on what today's photo happens
 * to look like.
 */

// Approximates --color-surface / the site's near-black chrome — text/UI roles are checked
// against this rather than the wallpaper itself, since that's what they actually sit on.
const DARK_CHROME_LUMINANCE = 0.02;

// Max background luminance for white text to still clear WCAG AA (4.5:1): solving
// (1.0 + 0.05) / (L + 0.05) = 4.5 for L. Anything brighter and content sitting directly on the
// wallpaper (no panel behind it) needs the scrim below.
const MAX_UNSCRIMMED_LUMINANCE = 0.1833;

// The same solve at WCAG's 3:1 bar, applied to the brightest region rather than the average:
// (1.0 + 0.05) / (L + 0.05) = 3. Holding a bright patch to AA outright would darken the other
// nine tenths of a photo to protect a sky, so the peak is held to the lower bar and the
// text-shadow in app.scss carries the remainder. The average still has to clear AA above.
const MAX_PEAK_LUMINANCE = 0.3;

// The scrim is driven by how bright the wallpaper gets *somewhere*, not by its average, so the
// sample is divided into this many cells per axis and each cell's own luminance is measured. A
// photo that is dark overall but bright exactly where chrome sits — sky behind the pivot header
// is the usual one — averages out to "no scrim needed" while washing out the text that actually
// sits on it.
const LUMINANCE_GRID = 6;

// Which cell to design for, as a fraction through the cells sorted dark to bright. The brightest
// single cell would let one specular highlight dim the whole photo; the 90th percentile answers
// "bright across a region large enough to hold text" instead — with a 6x6 grid that is the
// fourth-brightest cell, so roughly a ninth of the frame. The text-shadow in app.scss remains the
// safety net for whatever falls above it.
const LUMINANCE_PERCENTILE = 0.9;

export interface PaletteSample {
  hue: number;
  saturation: number;
  /** Mean relative luminance across the whole photo. */
  luminance: number;
  /** Relative luminance of its brightest regions, per the two constants above. */
  peakLuminance: number;
}

export function setCssVars(vars: Record<string, string>): void {
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(vars)) root.setProperty(key, value);
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function luminanceChannel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * luminanceChannel(r / 255) +
    0.7152 * luminanceChannel(g / 255) +
    0.0722 * luminanceChannel(b / 255)
  );
}

const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const m = l - c / 2;
  const r = Math.round((rgb[0] + m) * 255);
  const g = Math.round((rgb[1] + m) * 255);
  const b = Math.round((rgb[2] + m) * 255);
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return { hex, r, g, b };
}

const hsl = (hue: number, saturation: number, lightness: number): string =>
  hslToRgb(hue, saturation, lightness).hex;

/**
 * Nudges `lightness` up until the rendered color clears `minContrast` against `backgroundLuminance`.
 * The site's S/L ramp was tuned against one specific hue, and not every hue reaches the same
 * luminance at a given lightness (blues read darker than yellows at equal L) — so the ramp alone
 * can't guarantee legibility once the hue follows the wallpaper.
 */
function ensureContrast(
  hue: number,
  saturation: number,
  lightness: number,
  backgroundLuminance: number,
  minContrast: number
): string {
  let l = lightness;
  for (let i = 0; i < 30; i++) {
    const { hex, r, g, b } = hslToRgb(hue, saturation, l);
    if (contrastRatio(relativeLuminance(r, g, b), backgroundLuminance) >= minContrast || l >= 0.97) {
      return hex;
    }
    l += 0.02;
  }
  return hslToRgb(hue, saturation, l).hex;
}

function toRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Every accent/tint in the site's palette shares one hue and only varies in saturation/lightness
// (see app.scss's :root comment), so recoloring for a new wallpaper only ever needs to swap the
// hue through this same S/L ramp.
function buildPaletteVars(hue: number, intensity: number): Record<string, string> {
  const scale = (base: number) => clamp(base * (0.6 + 0.4 * intensity), 0.15, 0.85);

  // Accent: non-text usage only (borders, icon fills, selection/hover backgrounds) — WCAG's 3:1
  // UI-component minimum applies, not the stricter 4.5:1 for text.
  const accent = ensureContrast(hue, scale(0.68), 0.6, DARK_CHROME_LUMINANCE, 3.0);
  // AccentStrong doubles as literal link-hover text color, so it needs the 4.5:1 text minimum.
  const accentStrong = ensureContrast(hue, scale(0.72), 0.69, DARK_CHROME_LUMINANCE, 4.5);

  return {
    "--color-accent": accent,
    "--color-accent-strong": accentStrong,
    "--color-accent-soft": toRgba(accent, 0.16),
    // AccentMuted is unused as foreground text today — no contrast requirement to enforce.
    "--color-accent-muted": hsl(hue, scale(0.49), 0.44),
    "--color-text-secondary": ensureContrast(hue, scale(0.64), 0.88, DARK_CHROME_LUMINANCE, 4.5),
    "--color-text-muted": ensureContrast(hue, scale(0.4), 0.73, DARK_CHROME_LUMINANCE, 4.5),
    // TextFaint is deliberately the least prominent tier (timestamps/badges) — held to WCAG's
    // lower 3:1 bar so it stays visually distinct from Muted/Secondary instead of homogenizing
    // all three tiers to the same contrast.
    "--color-text-faint": ensureContrast(hue, scale(0.25), 0.53, DARK_CHROME_LUMINANCE, 3.0),
    // The "gray" chrome (modal background, scrollbar track) — desaturated and dark, but still
    // hue-tinted like everything else instead of being flat achromatic gray.
    "--color-surface": hsl(hue, clamp(scale(0.2), 0.05, 0.22), 0.1),
    // The footer's translucent "acrylic" panel. Deliberately more saturated than Surface: it sits
    // over the wallpaper rather than over the chrome, so it reads as a tinted veil on the photo
    // instead of a flat gray slab. Alpha matches the static value it replaces, keeping the
    // wallpaper's read-through — and the footer text's contrast — exactly as before.
    "--color-surface-veil": toRgba(hsl(hue, scale(0.6), 0.118), 0.55),
  };
}

/**
 * Returns the black-scrim opacity white text needs over this wallpaper, from two measurements
 * rather than one. Assumes a flat alpha composite (apparent ≈ source × (1 - opacity)), which is
 * what .wallpaper-scrim does.
 *
 *  - the mean has to clear AA (4.5:1), which is the long-standing behaviour, and
 *  - the brightest region has to clear 3:1, which is new.
 *
 * The stronger of the two wins. A mean on its own cannot see a photo that is dark overall but
 * bright exactly where chrome sits — sky behind the pivot header is the usual one — and that
 * photo washes out the header while reporting that no scrim is needed. Taking the max means the
 * regional term only ever adds darkening where a bright region actually exists, so photos that
 * were legible before are darkened no further than they already were.
 */
function computeScrimOpacity(meanLuminance: number, peakLuminance: number): number {
  const forMean =
    meanLuminance <= MAX_UNSCRIMMED_LUMINANCE ? 0 : 1 - MAX_UNSCRIMMED_LUMINANCE / meanLuminance;
  const forPeak =
    peakLuminance <= MAX_PEAK_LUMINANCE ? 0 : 1 - MAX_PEAK_LUMINANCE / peakLuminance;

  // never quite opaque — some photo should stay visible
  return clamp(Math.max(forMean, forPeak), 0, 0.82);
}

/**
 * Draws the wallpaper into an offscreen canvas and returns the saturation-weighted circular-mean
 * hue of its pixels, its overall WCAG relative luminance, and the luminance of its brightest
 * regions measured on a grid (see LUMINANCE_GRID). Never rejects — resolves null on
 * any failure (404, decode error, CORS-tainted canvas blocking getImageData) so the caller can
 * fall back to the static CSS palette.
 */
/**
 * Measures an image that is already loaded. Split out of extractDominant so the wallpaper's own
 * <img> can be sampled directly: requesting the same URL a second time from script would be a
 * separate cache entry in a different CORS mode, and the copy already on screen is the one whose
 * pixels are guaranteed to be there.
 */
function samplePixels(img: HTMLImageElement, sampleSize: number): PaletteSample | null {
  try {
    const scale = Math.min(1, sampleSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let sumSin = 0;
    let sumCos = 0;
    let weight = 0;
    let sumLuminance = 0;
    let opaqueCount = 0;

    // Per-cell luminance, for the regional peak the scrim is designed against.
    const cells = LUMINANCE_GRID * LUMINANCE_GRID;
    const cellLuminance = new Float64Array(cells);
    const cellCount = new Uint32Array(cells);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 128) continue; // skip transparent pixels
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      // Overall brightness drives the auto-darken decision, so — unlike the hue vote below —
      // every opaque pixel counts here, including the near-black/near-white/near-neutral ones
      // that hue deliberately skips.
      const pixelLuminance =
        0.2126 * luminanceChannel(r) + 0.7152 * luminanceChannel(g) + 0.0722 * luminanceChannel(b);
      sumLuminance += pixelLuminance;
      opaqueCount++;

      const pixel = i >> 2;
      const column = Math.min(
        LUMINANCE_GRID - 1,
        ((pixel % canvas.width) * LUMINANCE_GRID / canvas.width) | 0
      );
      const row = Math.min(
        LUMINANCE_GRID - 1,
        (((pixel / canvas.width) | 0) * LUMINANCE_GRID / canvas.height) | 0
      );
      const cell = row * LUMINANCE_GRID + column;
      // Read through a non-null assertion like the pixel accesses above: the index is
      // clamped into range by construction, but noUncheckedIndexedAccess cannot see that.
      cellLuminance[cell] = cellLuminance[cell]! + pixelLuminance;
      cellCount[cell] = cellCount[cell]! + 1;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (l < 0.08 || l > 0.92) continue; // skip near-black/near-white
      const d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (s < 0.15) continue; // skip near-neutral pixels

      let h: number;
      if (d === 0) h = 0;
      else if (max === r) h = 60 * ((((g - b) / d) % 6 + 6) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);

      const rad = (h * Math.PI) / 180;
      sumSin += Math.sin(rad) * s;
      sumCos += Math.cos(rad) * s;
      weight += s;
    }

    if (opaqueCount === 0) return null;
    const luminance = sumLuminance / opaqueCount;

    // Every cell that saw at least one opaque pixel, dark to bright. Cells can be empty when
    // the photo has transparent regions, and they must not count as black.
    const regions: number[] = [];
    for (let cell = 0; cell < cellCount.length; cell++) {
      if (cellCount[cell]! > 0) regions.push(cellLuminance[cell]! / cellCount[cell]!);
    }
    regions.sort((a, b) => a - b);

    // Falls back to the mean only if the grid somehow yielded nothing, which cannot happen
    // once a single opaque pixel exists but keeps the type honest.
    const peakLuminance =
      regions.length > 0
        ? regions[Math.min(regions.length - 1, Math.round(LUMINANCE_PERCENTILE * (regions.length - 1)))]!
        : luminance;

    if (weight === 0) {
      // No pixel was saturated enough to vote on a hue (greyscale/near-mono photo) — still
      // report luminance so the caller can darken it if it's too bright.
      return { hue: 0, saturation: 0, luminance, peakLuminance };
    }

    let hue = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    return {
      hue,
      saturation: Math.min(1, weight / (data.length / 4)),
      luminance,
      peakLuminance,
    };
  } catch {
    // getImageData throws SecurityError on a CORS-tainted canvas.
    return null;
  }
}

/**
 * Draws the wallpaper into an offscreen canvas and returns the saturation-weighted circular-mean
 * hue of its pixels, its overall WCAG relative luminance, and the luminance of its brightest
 * regions measured on a grid (see LUMINANCE_GRID). Never rejects — resolves null on any failure
 * (404, decode error, CORS-tainted canvas blocking getImageData) so the caller can fall back to
 * the static CSS palette.
 *
 * Pass an <img> that has already loaded in CORS mode to sample it in place; pass a URL and it
 * fetches its own copy.
 */
export function extractDominant(
  source: string | HTMLImageElement,
  sampleSize = 48
): Promise<PaletteSample | null> {
  if (typeof source !== "string") return Promise.resolve(samplePixels(source, sampleSize));

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onerror = () => resolve(null);
    img.onload = () => resolve(samplePixels(img, sampleSize));

    img.src = source;
  });
}

// Guards against a slow sample from an older applyWallpaper call overwriting the palette of a
// wallpaper that was swapped in after it, if calls overlap.
let generation = 0;

/**
 * Samples `imageUrl` and recolors the accent/text/surface custom properties from it, returning the
 * scrim opacity its brightness calls for (or null if it could not be sampled at all, leaving the
 * static app.scss palette in place). Safe to call repeatedly/concurrently: only the most recent
 * call's sample is ever applied.
 *
 * Showing the photo is deliberately not this function's job. Wallpaper.tsx owns that, driven by
 * the <img> element's own load event, so the wallpaper appears whether or not the pixels can be
 * read back out of a canvas.
 */
export async function applyPaletteFrom(source: string | HTMLImageElement): Promise<number | null> {
  const current = ++generation;

  const sample = await extractDominant(source);
  if (!sample || current !== generation) return null;

  setCssVars(buildPaletteVars(sample.hue, sample.saturation));

  return computeScrimOpacity(sample.luminance, sample.peakLuminance);
}

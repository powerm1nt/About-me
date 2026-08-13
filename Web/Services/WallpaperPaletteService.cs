using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.JSInterop;

namespace Web.Services;

/// <summary>
/// Recolors the accent/text-tint/surface CSS custom properties to match whatever wallpaper is
/// currently set, so the palette stays coherent if the wallpaper is ever swapped at runtime
/// (settings page, per-user background, daily rotation, etc.). Every derived color is checked
/// against WCAG's relative-luminance contrast formula and nudged lighter until it clears its
/// role's minimum ratio, and a wallpaper that's bright enough to wash out text sitting directly
/// on it gets a dark scrim layered under it — so legibility never depends on what today's photo
/// happens to look like.
/// </summary>
public class WallpaperPaletteService
{
    // Approximates --color-surface / the site's near-black chrome — text/UI roles are checked
    // against this rather than the wallpaper itself, since that's what they actually sit on.
    private const double DarkChromeLuminance = 0.02;

    // Max background luminance for white text to still clear WCAG AA (4.5:1): solving
    // (1.0 + 0.05) / (L + 0.05) = 4.5 for L. Anything brighter than this and content sitting
    // directly on the wallpaper (no panel behind it) needs the scrim below.
    private const double MaxUnscrimmedLuminance = 0.1833;

    private readonly IJSRuntime _js;

    // Guards against a slow sample from an older ApplyWallpaperAsync call overwriting
    // the palette of a wallpaper that was swapped in after it, if calls overlap.
    private int _generation;

    public string? CurrentWallpaperUrl { get; private set; }

    public WallpaperPaletteService(IJSRuntime js)
    {
        _js = js;
    }

    /// <summary>
    /// Points the CSS background at <paramref name="imageUrl"/> immediately, then samples
    /// it and re-derives the accent/text/surface palette and scrim strength from it. Safe to
    /// call repeatedly/concurrently — only the most recent call's sample is ever applied. On
    /// sample failure (404, decode error, CORS-tainted canvas) the static app.css palette
    /// is left in place rather than being reset to some default.
    /// </summary>
    public async Task ApplyWallpaperAsync(string imageUrl)
    {
        var generation = ++_generation;
        CurrentWallpaperUrl = imageUrl;

        await _js.InvokeVoidAsync("nukaPalette.setVars", new Dictionary<string, string>
        {
            ["--wallpaper-url"] = $"url(\"{imageUrl}\")",
        });

        PaletteSample? sample;
        try
        {
            sample = await _js.InvokeAsync<PaletteSample?>("nukaPalette.extractDominant", imageUrl);
        }
        catch (JSException)
        {
            sample = null;
        }

        if (sample is null || generation != _generation) return;

        var palette = BuildPalette(sample.Value.Hue, sample.Value.Saturation);
        var scrimOpacity = ComputeScrimOpacity(sample.Value.Luminance);
        await InjectAsync(palette, scrimOpacity);
    }

    // Every accent/tint in the site's palette shares one hue and only varies in
    // saturation/lightness (see app.css's :root comment) — so recoloring for a new wallpaper
    // only ever needs to swap the hue through this same S/L ramp. That ramp was tuned against
    // one specific hue though, and not every hue reaches the same luminance at a given
    // lightness (blues read darker than yellows at equal L) — EnsureContrast nudges lightness
    // up per-role until the *actual* rendered color clears its role's minimum contrast ratio
    // against the dark chrome, so legibility holds for every hue, not just the one this was
    // designed against.
    private static Palette BuildPalette(double hue, double intensity)
    {
        double Scale(double baseSaturation) => Math.Clamp(baseSaturation * (0.6 + 0.4 * intensity), 0.15, 0.85);

        return new Palette(
            // Accent: non-text usage only (borders, icon fills, selection/hover backgrounds) —
            // WCAG's 3:1 UI-component minimum applies, not the stricter 4.5:1 for text.
            Accent: EnsureContrast(hue, Scale(0.68), 0.60, DarkChromeLuminance, 3.0),
            // AccentStrong doubles as literal link-hover text color, so it needs the 4.5:1 text minimum.
            AccentStrong: EnsureContrast(hue, Scale(0.72), 0.69, DarkChromeLuminance, 4.5),
            // AccentMuted is unused as foreground text today — no contrast requirement to enforce.
            AccentMuted: Hsl(hue, Scale(0.49), 0.44),
            TextSecondary: EnsureContrast(hue, Scale(0.64), 0.88, DarkChromeLuminance, 4.5),
            TextMuted: EnsureContrast(hue, Scale(0.40), 0.73, DarkChromeLuminance, 4.5),
            // TextFaint is deliberately the least prominent tier (timestamps/badges) — held to
            // WCAG's lower 3:1 bar so it stays visually distinct from Muted/Secondary instead of
            // homogenizing all three tiers to the same contrast.
            TextFaint: EnsureContrast(hue, Scale(0.25), 0.53, DarkChromeLuminance, 3.0),
            // The "gray" chrome (modal background, scrollbar track) — desaturated and dark, but
            // still hue-tinted like everything else instead of being flat achromatic gray.
            Surface: Hsl(hue, Math.Clamp(Scale(0.20), 0.05, 0.22), 0.10));
    }

    // If the wallpaper itself is bright enough that white text laid directly over it (no panel
    // behind it — e.g. the pivot header labels) would fail WCAG AA, returns the black-scrim
    // opacity needed to bring its apparent luminance down to the AA cutoff. Assumes a flat alpha
    // composite (apparentLuminance ≈ sourceLuminance * (1 - opacity)), which is what the CSS
    // scrim layer in app.css actually does.
    private static double ComputeScrimOpacity(double wallpaperLuminance)
    {
        if (wallpaperLuminance <= MaxUnscrimmedLuminance) return 0;
        var opacity = 1 - (MaxUnscrimmedLuminance / wallpaperLuminance);
        return Math.Clamp(opacity, 0, 0.82); // never quite opaque — some photo should stay visible
    }

    private static string EnsureContrast(double hue, double saturation, double lightness,
        double backgroundLuminance, double minContrast)
    {
        (string Hex, int R, int G, int B) rgb;
        for (var i = 0; i < 30; i++)
        {
            rgb = HslToRgb(hue, saturation, lightness);
            var contrast = ContrastRatio(RelativeLuminance(rgb.R, rgb.G, rgb.B), backgroundLuminance);
            if (contrast >= minContrast || lightness >= 0.97) return rgb.Hex;
            lightness += 0.02;
        }
        return HslToRgb(hue, saturation, lightness).Hex;
    }

    private static double RelativeLuminance(int r, int g, int b)
    {
        static double Channel(int c)
        {
            var cs = c / 255.0;
            return cs <= 0.03928 ? cs / 12.92 : Math.Pow((cs + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * Channel(r) + 0.7152 * Channel(g) + 0.0722 * Channel(b);
    }

    private static double ContrastRatio(double luminanceA, double luminanceB)
    {
        var lighter = Math.Max(luminanceA, luminanceB);
        var darker = Math.Min(luminanceA, luminanceB);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private async Task InjectAsync(Palette p, double scrimOpacity)
    {
        await _js.InvokeVoidAsync("nukaPalette.setVars", new Dictionary<string, string>
        {
            ["--color-accent"] = p.Accent,
            ["--color-accent-strong"] = p.AccentStrong,
            ["--color-accent-soft"] = ToRgba(p.Accent, 0.16),
            ["--color-accent-muted"] = p.AccentMuted,
            ["--color-text-secondary"] = p.TextSecondary,
            ["--color-text-muted"] = p.TextMuted,
            ["--color-text-faint"] = p.TextFaint,
            ["--color-surface"] = p.Surface,
            ["--wallpaper-scrim-opacity"] = scrimOpacity.ToString(CultureInfo.InvariantCulture),
        });
    }

    private static string Hsl(double hue, double saturation, double lightness) =>
        HslToRgb(hue, saturation, lightness).Hex;

    private static (string Hex, int R, int G, int B) HslToRgb(double hue, double saturation, double lightness)
    {
        saturation = Math.Clamp(saturation, 0, 1);
        lightness = Math.Clamp(lightness, 0, 1);
        double c = (1 - Math.Abs(2 * lightness - 1)) * saturation;
        double hp = hue / 60.0;
        double x = c * (1 - Math.Abs(hp % 2 - 1));
        var (r1, g1, b1) = hp switch
        {
            < 1 => (c, x, 0.0),
            < 2 => (x, c, 0.0),
            < 3 => (0.0, c, x),
            < 4 => (0.0, x, c),
            < 5 => (x, 0.0, c),
            _ => (c, 0.0, x),
        };
        double m = lightness - c / 2;
        int r = (int)Math.Round((r1 + m) * 255);
        int g = (int)Math.Round((g1 + m) * 255);
        int b = (int)Math.Round((b1 + m) * 255);
        return ($"#{r:x2}{g:x2}{b:x2}", r, g, b);
    }

    private static string ToRgba(string hex, double alpha)
    {
        int r = int.Parse(hex.AsSpan(1, 2), NumberStyles.HexNumber);
        int g = int.Parse(hex.AsSpan(3, 2), NumberStyles.HexNumber);
        int b = int.Parse(hex.AsSpan(5, 2), NumberStyles.HexNumber);
        return $"rgba({r}, {g}, {b}, {alpha.ToString(CultureInfo.InvariantCulture)})";
    }

    private readonly record struct PaletteSample(
        [property: JsonPropertyName("hue")] double Hue,
        [property: JsonPropertyName("saturation")] double Saturation,
        [property: JsonPropertyName("luminance")] double Luminance);

    private readonly record struct Palette(
        string Accent,
        string AccentStrong,
        string AccentMuted,
        string TextSecondary,
        string TextMuted,
        string TextFaint,
        string Surface);
}

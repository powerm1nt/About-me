using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.JSInterop;

namespace Web.Services;

/// <summary>
/// Recolors the accent/text-tint CSS custom properties to match whatever wallpaper is
/// currently set, so the palette stays coherent if the wallpaper is ever swapped at
/// runtime (settings page, per-user background, etc.) instead of the single hardcoded
/// image app.css shipped with originally.
/// </summary>
public class WallpaperPaletteService
{
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
    /// it and re-derives the accent/text palette from its dominant hue. Safe to call
    /// repeatedly/concurrently — only the most recent call's sample is ever applied. On
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

        await InjectAsync(BuildPalette(sample.Value.Hue, sample.Value.Saturation));
    }

    // Every accent/tint in the site's palette shares one hue and only varies in
    // saturation/lightness (see app.css's :root comment) — so recoloring for a new
    // wallpaper only ever needs to swap the hue through this same S/L ramp. Keeps the
    // result legible no matter what the source photo looks like: lightness per role is
    // fixed, never derived from the image, so contrast against the dark chrome never
    // degrades even for a washed-out or very dark wallpaper.
    private static Palette BuildPalette(double hue, double intensity)
    {
        double Scale(double baseSaturation) => Math.Clamp(baseSaturation * (0.6 + 0.4 * intensity), 0.15, 0.85);

        return new Palette(
            Accent: Hsl(hue, Scale(0.68), 0.60),
            AccentStrong: Hsl(hue, Scale(0.72), 0.69),
            AccentMuted: Hsl(hue, Scale(0.49), 0.44),
            TextSecondary: Hsl(hue, Scale(0.64), 0.88),
            TextMuted: Hsl(hue, Scale(0.40), 0.73),
            TextFaint: Hsl(hue, Scale(0.25), 0.53));
    }

    private async Task InjectAsync(Palette p)
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
        });
    }

    private static string Hsl(double hue, double saturation, double lightness)
    {
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
        return $"#{r:x2}{g:x2}{b:x2}";
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
        [property: JsonPropertyName("saturation")] double Saturation);

    private readonly record struct Palette(
        string Accent,
        string AccentStrong,
        string AccentMuted,
        string TextSecondary,
        string TextMuted,
        string TextFaint);
}

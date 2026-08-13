using System.Net.Http.Json;
using System.Text.Json;
using Shared.Dto;

namespace Web.Services;

// Resolves which wallpaper to show on boot: today's Bing "picture of the day", proxied through
// Server (see WallpaperController) so the browser never hotlinks bing.com directly. Falls back to
// the bundled static wallpaper if Server or Bing is unreachable, so a backend hiccup never leaves
// the page without a background.
public class DailyWallpaperService
{
    public const string FallbackWallpaperUrl = "/assets/default2.png";

    private readonly HttpClient _http;

    public DailyWallpaperService(HttpClient http)
    {
        _http = http;
    }

    public async Task<string> ResolveWallpaperUrlAsync()
    {
        try
        {
            var dto = await _http.GetFromJsonAsync<BingWallpaperDto>("api/wallpaper/bing");
            if (!string.IsNullOrWhiteSpace(dto?.ImageUrl))
                return dto.ImageUrl;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            // Server/Bing unreachable — fall back to the bundled static wallpaper below.
        }

        return FallbackWallpaperUrl;
    }
}

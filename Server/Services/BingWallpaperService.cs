using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;

namespace Server.Services;

// Bing's "picture of the day" (unofficial HPImageArchive.aspx endpoint, no key required) fetched
// and cached here rather than left for the client to hotlink: bing.com doesn't send CORS headers,
// so a browser <img crossorigin> painted from it taints the canvas and blocks the palette
// sampler's getImageData call. WallpaperController re-serves the bytes from our own origin, which
// we do send CORS headers for (the app's default policy already covers every route).
public class BingWallpaperService
{
    private const string Market = "en-US";
    private const string CacheKey = "bing-wallpaper";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);

    private readonly MemoryCache _cache = new(new MemoryCacheOptions());
    private readonly IHttpClientFactory _httpClientFactory;

    public BingWallpaperService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<BingWallpaperEntry?> GetTodayAsync()
    {
        if (_cache.TryGetValue(CacheKey, out BingWallpaperEntry? cached) && cached is not null)
            return cached;

        var entry = await FetchAsync();
        if (entry is null) return null;

        _cache.Set(CacheKey, entry, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = CacheDuration
        });
        return entry;
    }

    private async Task<BingWallpaperEntry?> FetchAsync()
    {
        var http = _httpClientFactory.CreateClient();
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("About-me-Server", "1.0"));

        BingArchiveResponse? archive;
        try
        {
            archive = await http.GetFromJsonAsync<BingArchiveResponse>(
                $"https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt={Market}");
        }
        catch (Exception ex) when (ex is HttpRequestException or System.Text.Json.JsonException)
        {
            return null;
        }

        var image = archive?.Images?.FirstOrDefault();
        if (string.IsNullOrEmpty(image?.Url)) return null;

        HttpResponseMessage imageResponse;
        try
        {
            imageResponse = await http.GetAsync($"https://www.bing.com{image.Url}");
        }
        catch (HttpRequestException)
        {
            return null;
        }
        if (!imageResponse.IsSuccessStatusCode) return null;

        var bytes = await imageResponse.Content.ReadAsByteArrayAsync();
        var contentType = imageResponse.Content.Headers.ContentType?.MediaType ?? "image/jpeg";

        return new BingWallpaperEntry(bytes, contentType, image.Title ?? string.Empty,
            image.Copyright ?? string.Empty, image.StartDate ?? string.Empty);
    }

    private class BingArchiveResponse
    {
        [JsonPropertyName("images")]
        public List<BingImage>? Images { get; set; }
    }

    private class BingImage
    {
        [JsonPropertyName("url")]
        public string? Url { get; set; }

        [JsonPropertyName("title")]
        public string? Title { get; set; }

        [JsonPropertyName("copyright")]
        public string? Copyright { get; set; }

        [JsonPropertyName("startdate")]
        public string? StartDate { get; set; }
    }
}

public record BingWallpaperEntry(byte[] ImageBytes, string ContentType, string Title, string Copyright, string Date);

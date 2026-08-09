using Microsoft.Extensions.Caching.Memory;

namespace Server.Services;

// Separate from the auth-session IMemoryCache: auth entries are small and uniform, so a
// count-based SizeLimit works fine there. Rendered page/article content varies from a few KB
// to potentially much more, so this cache bounds itself by actual bytes stored instead —
// otherwise a handful of large pages could quietly exhaust RAM under a count-based limit.
public class PageContentCache
{
    private const long SizeLimitBytes = 20 * 1024 * 1024; // 20 MB
    private static readonly TimeSpan Duration = TimeSpan.FromMinutes(5);

    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = SizeLimitBytes });

    public bool TryGet<T>(string key, out T? value) => _cache.TryGetValue(key, out value);

    public void Set<T>(string key, T value, long sizeBytes) =>
        _cache.Set(key, value, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = Duration,
            Size = sizeBytes
        });
}

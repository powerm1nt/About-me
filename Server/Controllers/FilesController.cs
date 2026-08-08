using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Server.Services;

namespace Server.Controllers;

[ApiController]
[Route("[controller]")]
public class FilesController : ControllerBase
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(10);

    private readonly BlobStorageService _blob;
    private readonly IMemoryCache _cache;

    public FilesController(BlobStorageService blob, IMemoryCache cache)
    {
        _blob = blob;
        _cache = cache;
    }

    [HttpGet("/api/files/{*path}")]
    public Task<IActionResult> GetFileApi(string path) => ServeBlob(path);

    [HttpGet("/assets/{*path}")]
    public Task<IActionResult> GetAsset(string path) => ServeBlob(path);

    private async Task<IActionResult> ServeBlob(string path)
    {
        // Normalize and reject any path that tries to escape the container root.
        var normalized = path.Replace('\\', '/').Trim('/');
        if (normalized.Contains("../") || normalized.Contains("./") ||
            normalized.StartsWith("..") || string.IsNullOrWhiteSpace(normalized))
            return BadRequest(new { error = "Invalid path." });

        // Reject absolute URIs embedded in the path segment.
        if (Uri.TryCreate(normalized, UriKind.Absolute, out _))
            return BadRequest(new { error = "Invalid path." });

        var cacheKey = $"blob:{normalized}";

        if (!_cache.TryGetValue(cacheKey, out CachedBlob? cached) || cached is null)
        {
            var (stream, contentType, found) = await _blob.GetFileAsync(normalized);

            if (!found || stream is null)
                return NotFound(new { error = $"File '{normalized}' not found in storage." });

            // Read into memory so we can cache the bytes and return them on future requests.
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms);
            await stream.DisposeAsync();

            cached = new CachedBlob(ms.ToArray(), contentType);

            _cache.Set(cacheKey, cached, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = CacheDuration,
                Size = cached.Data.Length
            });
        }

        return File(cached.Data, cached.ContentType);
    }

    private sealed record CachedBlob(byte[] Data, string ContentType);
}

using Microsoft.Extensions.Caching.Memory;

namespace Server.Services;

public record AuthSession(string AccessToken, string Login, string AvatarUrl, string Name = "");

// Maps an opaque session id (handed to the browser) to the caller's GitHub access token,
// which never leaves the server. Session lookup happens via the X-Proposal-Session header.
public class AuthSessionStore
{
    public const string SessionHeaderName = "X-Proposal-Session";

    private static readonly TimeSpan SessionDuration = TimeSpan.FromHours(2);
    private readonly IMemoryCache _cache;

    public AuthSessionStore(IMemoryCache cache) => _cache = cache;

    public string CreateSession(AuthSession session)
    {
        var sessionId = Guid.NewGuid().ToString("N");
        _cache.Set(CacheKey(sessionId), session, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = SessionDuration,
            Size = 1
        });
        return sessionId;
    }

    public AuthSession? GetSession(string? sessionId)
    {
        if (string.IsNullOrEmpty(sessionId)) return null;
        return _cache.TryGetValue(CacheKey(sessionId), out AuthSession? session) ? session : null;
    }

    public void RemoveSession(string sessionId) => _cache.Remove(CacheKey(sessionId));

    private static string CacheKey(string sessionId) => $"session:{sessionId}";
}

using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Server.Services;
using Shared.Config;
using Shared.Dto;

namespace Server.Controllers;

[ApiController]
[Route("api/auth/github")]
public class AuthController : ControllerBase
{
    private static readonly TimeSpan StateDuration = TimeSpan.FromMinutes(5);

    private readonly GitHubConfig _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly AuthSessionStore _sessions;
    private readonly string[] _allowedOrigins;

    public AuthController(IOptions<GitHubConfig> config, IHttpClientFactory httpClientFactory,
        IMemoryCache cache, AuthSessionStore sessions, IConfiguration configuration)
    {
        _config = config.Value;
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _sessions = sessions;
        _allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
    }

    // GET /api/auth/github/login?returnUrl=https://blog.nuka.works/blog/welcome&edit=1
    [HttpGet("login")]
    public IActionResult Login([FromQuery] string returnUrl, [FromQuery] bool edit = false)
    {
        if (!IsAllowedReturnUrl(returnUrl))
            return BadRequest(new { error = "Invalid returnUrl." });

        var state = Guid.NewGuid().ToString("N");
        _cache.Set(StateCacheKey(state), new PendingLogin(returnUrl, edit), new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = StateDuration,
            Size = 1
        });

        var callbackUrl = Url.Action(nameof(Callback), null, null, Request.Scheme)!;
        var authorizeUrl = "https://github.com/login/oauth/authorize" +
            $"?client_id={Uri.EscapeDataString(_config.ClientId)}" +
            $"&redirect_uri={Uri.EscapeDataString(callbackUrl)}" +
            "&scope=public_repo" +
            $"&state={state}";

        return Redirect(authorizeUrl);
    }

    // GET /api/auth/github/callback?code=...&state=...
    [HttpGet("callback")]
    public async Task<IActionResult> Callback([FromQuery] string code, [FromQuery] string state)
    {
        if (!_cache.TryGetValue(StateCacheKey(state), out PendingLogin? pending) || pending is null)
            return BadRequest(new { error = "Invalid or expired login attempt." });
        _cache.Remove(StateCacheKey(state));

        var http = _httpClientFactory.CreateClient();
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("About-me-Server", "1.0"));
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var callbackUrl = Url.Action(nameof(Callback), null, null, Request.Scheme)!;
        var tokenResponse = await http.PostAsJsonAsync("https://github.com/login/oauth/access_token", new
        {
            client_id = _config.ClientId,
            client_secret = _config.ClientSecret,
            code,
            redirect_uri = callbackUrl
        });

        if (!tokenResponse.IsSuccessStatusCode)
            return StatusCode(502, new { error = "GitHub token exchange failed." });

        var token = await tokenResponse.Content.ReadFromJsonAsync<GitHubTokenResponse>();
        if (token?.AccessToken is null)
            return StatusCode(502, new { error = "GitHub did not return an access token." });

        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        var user = await http.GetFromJsonAsync<GitHubUserResponse>("https://api.github.com/user");
        if (user?.Login is null)
            return StatusCode(502, new { error = "Could not read GitHub user profile." });

        var sessionId = _sessions.CreateSession(new AuthSession(token.AccessToken, user.Login, user.AvatarUrl ?? string.Empty));

        var separator = pending.ReturnUrl.Contains('?') ? '&' : '?';
        var redirectTo = $"{pending.ReturnUrl}{separator}session={sessionId}{(pending.Edit ? "&edit=1" : string.Empty)}";
        return Redirect(redirectTo);
    }

    // GET /api/auth/me — resolves the caller's GitHub identity from their session header.
    [HttpGet("/api/auth/me")]
    public ActionResult<AuthUserDto> Me()
    {
        var sessionId = Request.Headers[AuthSessionStore.SessionHeaderName].FirstOrDefault();
        var session = _sessions.GetSession(sessionId);
        if (session is null)
            return Unauthorized();

        return Ok(new AuthUserDto { Login = session.Login, AvatarUrl = session.AvatarUrl });
    }

    // POST /api/auth/logout
    [HttpPost("/api/auth/logout")]
    public IActionResult Logout()
    {
        var sessionId = Request.Headers[AuthSessionStore.SessionHeaderName].FirstOrDefault();
        if (!string.IsNullOrEmpty(sessionId))
            _sessions.RemoveSession(sessionId);
        return NoContent();
    }

    // Only allow redirecting back to an origin this API already trusts (Cors:AllowedOrigins),
    // to prevent the OAuth flow being used as an open redirect that leaks the session id.
    private bool IsAllowedReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrWhiteSpace(returnUrl)) return false;
        if (!Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri)) return false;

        return _allowedOrigins.Any(origin =>
            Uri.TryCreate(origin, UriKind.Absolute, out var allowed) &&
            allowed.Scheme == uri.Scheme &&
            allowed.Authority == uri.Authority);
    }

    private static string StateCacheKey(string state) => $"oauth-state:{state}";

    private record PendingLogin(string ReturnUrl, bool Edit);

    private class GitHubTokenResponse
    {
        [JsonPropertyName("access_token")]
        public string? AccessToken { get; set; }
    }

    private class GitHubUserResponse
    {
        [JsonPropertyName("login")]
        public string? Login { get; set; }

        [JsonPropertyName("avatar_url")]
        public string? AvatarUrl { get; set; }
    }
}

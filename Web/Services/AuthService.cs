using System.Net.Http.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.JSInterop;
using Shared.Dto;

namespace Web.Services;

// Tracks the visitor's GitHub sign-in state for the "propose changes" flow. The actual GitHub
// access token never reaches the browser — only an opaque session id (persisted to localStorage)
// that the Server maps back to the token server-side.
public class AuthService
{
    private const string StorageKey = "proposal-session";
    private const string SessionHeader = "X-Proposal-Session";

    private readonly HttpClient _http;
    private readonly IJSRuntime _js;
    private readonly NavigationManager _nav;
    private readonly string _apiBaseUrl;

    private string? _sessionId;

    public AuthUserDto? CurrentUser { get; private set; }
    public bool IsSignedIn => CurrentUser is not null;

    public event Action? OnChange;

    public AuthService(HttpClient http, IJSRuntime js, NavigationManager nav, IConfiguration config)
    {
        _http = http;
        _js = js;
        _nav = nav;
        _apiBaseUrl = (config["ApiBaseUrl"] ?? string.Empty).TrimEnd('/');
    }

    // Call once at startup. Picks up a `?session=` param left by the OAuth callback redirect
    // (saving it to localStorage and stripping it from the URL), otherwise restores a previously
    // saved session. Returns true if the URL asked to resume edit mode (`?edit=1`).
    public async Task<bool> InitializeAsync()
    {
        var uri = new Uri(_nav.Uri);
        var query = QueryHelpers.ParseQuery(uri.Query);
        var resumeEdit = false;

        if (query.TryGetValue("session", out var sessionFromUrl))
        {
            _sessionId = sessionFromUrl.ToString();
            resumeEdit = query.TryGetValue("edit", out var editFlag) && editFlag == "1";
            await _js.InvokeVoidAsync("localStorage.setItem", StorageKey, _sessionId);
            _nav.NavigateTo(uri.GetLeftPart(UriPartial.Path), replace: true);
        }
        else
        {
            _sessionId = await _js.InvokeAsync<string?>("localStorage.getItem", StorageKey);
        }

        await RefreshUserAsync();
        return resumeEdit;
    }

    // Redirects the whole page to the Server's GitHub OAuth login; `resumeEdit` tells the callback
    // to resume edit mode automatically once the user lands back on this page. The Server model-binds
    // this as a bool, which only accepts the literals "true"/"false" (not "1"/"0").
    public void RedirectToLogin(bool resumeEdit) =>
        _nav.NavigateTo(
            $"{_apiBaseUrl}/api/auth/github/login?returnUrl={Uri.EscapeDataString(_nav.Uri)}&edit={(resumeEdit ? "true" : "false")}",
            forceLoad: true);

    public async Task LogoutAsync()
    {
        if (_sessionId is not null)
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout");
                request.Headers.Add(SessionHeader, _sessionId);
                await _http.SendAsync(request);
            }
            catch { /* best-effort */ }
        }

        _sessionId = null;
        CurrentUser = null;
        await _js.InvokeVoidAsync("localStorage.removeItem", StorageKey);
        OnChange?.Invoke();
    }

    // Attaches the session header to a caller-built request (used for /api/proposals).
    public HttpRequestMessage WithSession(HttpRequestMessage request)
    {
        if (_sessionId is not null)
            request.Headers.Add(SessionHeader, _sessionId);
        return request;
    }

    private async Task RefreshUserAsync()
    {
        if (_sessionId is null)
        {
            CurrentUser = null;
            return;
        }

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
            request.Headers.Add(SessionHeader, _sessionId);
            var response = await _http.SendAsync(request);
            CurrentUser = response.IsSuccessStatusCode
                ? await response.Content.ReadFromJsonAsync<AuthUserDto>()
                : null;
        }
        catch
        {
            CurrentUser = null;
        }

        OnChange?.Invoke();
    }
}

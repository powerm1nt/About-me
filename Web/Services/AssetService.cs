using Microsoft.JSInterop;

namespace Web.Services;

public class AssetService
{
    private readonly string _baseUrl;
    private readonly IJSRuntime _js;

    public AssetService(IConfiguration config, IJSRuntime js)
    {
        _baseUrl = config["AssetBaseUrl"]?.TrimEnd('/') ?? string.Empty;
        _js = js;
    }

    /// <summary>Returns the CDN/blob URL for a static asset, e.g. Url("pfp.jpg") → "https://nwrks-cdn.public.prod.nuka.works/static/pfp.jpg".</summary>
    public string Url(string path) => $"{_baseUrl}/{path.TrimStart('/')}";

    /// <summary>Injects --cardboard-url and other CSS variables into :root so CSS background-image rules can reference blob assets.</summary>
    public async Task InjectCssVariablesAsync()
    {
        var cardboardUrl = Url("cardboard.png");
        await _js.InvokeVoidAsync("eval",
            $"document.documentElement.style.setProperty('--cardboard-url', 'url(\"{cardboardUrl}\")')");
    }
}

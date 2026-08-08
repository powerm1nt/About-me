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

    /// <summary>Returns the Server asset proxy URL, e.g. Url("pfp.jpg") → "http://localhost:5066/assets/pfp.jpg" which the Server streams from blob.</summary>
    public string Url(string path) => $"{_baseUrl}/{path.TrimStart('/')}";

    /// <summary>Injects --cardboard-url and other CSS variables into :root so CSS background-image rules can reference blob assets.</summary>
    public async Task InjectCssVariablesAsync()
    {
        var cardboardUrl = Url("cardboard.png");
        await _js.InvokeVoidAsync("eval",
            $"document.documentElement.style.setProperty('--cardboard-url', 'url(\"{cardboardUrl}\")')");
    }
}

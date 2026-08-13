using Microsoft.AspNetCore.Mvc;
using Server.Services;
using Shared.Dto;

namespace Server.Controllers;

[ApiController]
[Route("api/wallpaper")]
public class WallpaperController : ControllerBase
{
    private readonly BingWallpaperService _bing;

    public WallpaperController(BingWallpaperService bing)
    {
        _bing = bing;
    }

    // GET /api/wallpaper/bing — today's Bing "picture of the day" metadata. imageUrl points back
    // at GetBingImage below (not bing.com directly), so the client can sample it into a canvas
    // without a cross-origin taint.
    [HttpGet("bing")]
    public async Task<ActionResult<BingWallpaperDto>> GetBing()
    {
        var entry = await _bing.GetTodayAsync();
        if (entry is null)
            return StatusCode(502, new { error = "Could not fetch today's Bing wallpaper." });

        // no-store, deliberately: this route is also reachable by a direct top-level navigation
        // (no Origin header), and a shared/public cache entry from that request would get replayed
        // for later cross-origin fetches too — replied without an Access-Control-Allow-Origin
        // header, since CORS middleware only adds one when a request actually carries an Origin
        // header. The 1h server-side cache in BingWallpaperService already covers freshness, so
        // browser caching here isn't needed and isn't worth that risk.
        Response.Headers.CacheControl = "no-store";
        return Ok(new BingWallpaperDto
        {
            ImageUrl = Url.Action(nameof(GetBingImage), null, null, Request.Scheme)!,
            Title = entry.Title,
            Copyright = entry.Copyright,
            Date = entry.Date
        });
    }

    // GET /api/wallpaper/bing/image — the actual bytes, same cached entry as GetBing above.
    [HttpGet("bing/image")]
    public async Task<IActionResult> GetBingImage()
    {
        var entry = await _bing.GetTodayAsync();
        if (entry is null)
            return StatusCode(502, new { error = "Could not fetch today's Bing wallpaper." });

        Response.Headers.CacheControl = "no-store"; // see GetBing() above
        return File(entry.ImageBytes, entry.ContentType);
    }
}

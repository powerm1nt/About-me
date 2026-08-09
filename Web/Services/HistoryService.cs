using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Web.Services;

// Reconstructs a page's edit history straight from the repo's patches/ folder — no Server
// involvement needed: the GitHub REST API and raw.githubusercontent.com both allow unauthenticated
// cross-origin GETs on public repos, so this runs entirely in the browser.
public class HistoryService
{
    private const string Owner = "powerm1nt";
    private const string Repo = "About-me";

    private readonly HttpClient _http = new();

    // Commits that touched patches/{docPath}/ — one entry per merged proposal for this page,
    // newest first. The commit message here is the visitor's own "commit message" from the editor.
    public async Task<List<RevisionSummary>> GetRevisionsAsync(string docPath)
    {
        var url = $"https://api.github.com/repos/{Owner}/{Repo}/commits" +
                   $"?path={Uri.EscapeDataString($"patches/{docPath}")}&per_page=50";

        var items = await GetJsonAsync<List<GitHubCommitListItem>>(url) ?? [];

        return items
            .Select(i => new RevisionSummary
            {
                Sha = i.Sha,
                Message = i.Commit.Message,
                AuthorLogin = i.Author?.Login ?? i.Commit.Author.Name,
                AuthorAvatarUrl = i.Author?.AvatarUrl ?? string.Empty,
                Date = i.Commit.Author.Date,
                HtmlUrl = i.HtmlUrl
            })
            .OrderByDescending(r => r.Date)
            .ToList();
    }

    // Looks up which patch file a given commit added/changed for this doc, fetches its raw
    // content, and parses it into hunks.
    public async Task<List<DiffHunk>> GetRevisionDiffAsync(string sha, string docPath)
    {
        var detailUrl = $"https://api.github.com/repos/{Owner}/{Repo}/commits/{sha}";
        var detail = await GetJsonAsync<GitHubCommitDetail>(detailUrl);

        var prefix = $"patches/{docPath}/";
        var file = detail?.Files.FirstOrDefault(f =>
            f.Filename.StartsWith(prefix, StringComparison.Ordinal) &&
            f.Filename.EndsWith(".patch", StringComparison.Ordinal));

        if (file is null)
            return [];

        // Built directly against raw.githubusercontent.com rather than following the API's own
        // `raw_url` (a github.com/.../raw/... redirect whose intermediate 302 sends an empty
        // Access-Control-Allow-Origin, unlike the final raw.githubusercontent.com response).
        var rawUrl = $"https://raw.githubusercontent.com/{Owner}/{Repo}/{sha}/{string.Join('/', file.Filename.Split('/').Select(Uri.EscapeDataString))}";
        var patchText = await _http.GetStringAsync(rawUrl);
        return UnifiedDiffParser.Parse(patchText);
    }

    private async Task<T?> GetJsonAsync<T>(string url)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));

        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            return default;

        return await response.Content.ReadFromJsonAsync<T>();
    }
}

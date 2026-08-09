using System.Text.Json.Serialization;

namespace Web.Services;

public class RevisionSummary
{
    public string Sha { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string AuthorLogin { get; set; } = string.Empty;
    public string AuthorAvatarUrl { get; set; } = string.Empty;
    public DateTimeOffset Date { get; set; }
    public string HtmlUrl { get; set; } = string.Empty;
}

public enum DiffLineType { Context, Added, Removed }

public class DiffLine
{
    public DiffLineType Type { get; set; }
    public string Text { get; set; } = string.Empty;
}

// One @@ ... @@ hunk from a unified diff, with helpers to reconstruct the markdown on either side.
public class DiffHunk
{
    public string Header { get; set; } = string.Empty;
    public List<DiffLine> Lines { get; set; } = [];

    public string OldText => string.Join("\n", Lines.Where(l => l.Type != DiffLineType.Added).Select(l => l.Text));
    public string NewText => string.Join("\n", Lines.Where(l => l.Type != DiffLineType.Removed).Select(l => l.Text));
}

// Minimal shapes for the GitHub REST API responses HistoryService reads (snake_case JSON).
internal class GitHubCommitListItem
{
    [JsonPropertyName("sha")] public string Sha { get; set; } = string.Empty;
    [JsonPropertyName("commit")] public GitHubCommitInfo Commit { get; set; } = new();
    [JsonPropertyName("author")] public GitHubUserInfo? Author { get; set; }
    [JsonPropertyName("html_url")] public string HtmlUrl { get; set; } = string.Empty;
}

internal class GitHubCommitInfo
{
    [JsonPropertyName("message")] public string Message { get; set; } = string.Empty;
    [JsonPropertyName("author")] public GitHubCommitAuthor Author { get; set; } = new();
}

internal class GitHubCommitAuthor
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("date")] public DateTimeOffset Date { get; set; }
}

internal class GitHubUserInfo
{
    [JsonPropertyName("login")] public string Login { get; set; } = string.Empty;
    [JsonPropertyName("avatar_url")] public string AvatarUrl { get; set; } = string.Empty;
}

internal class GitHubCommitDetail : GitHubCommitListItem
{
    [JsonPropertyName("files")] public List<GitHubCommitFile> Files { get; set; } = [];
}

internal class GitHubCommitFile
{
    [JsonPropertyName("filename")] public string Filename { get; set; } = string.Empty;
}

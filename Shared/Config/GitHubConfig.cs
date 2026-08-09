namespace Shared.Config;

public class GitHubConfig
{
    public const string SectionName = "GitHub";

    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string RepoOwner { get; set; } = string.Empty;
    public string RepoName { get; set; } = string.Empty;
}

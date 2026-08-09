using Microsoft.Extensions.Options;
using Octokit;
using Shared.Config;
using Shared.Dto;

namespace Server.Services;

// Opens a proposal PR against the upstream repo using the *caller's own* GitHub token: forks
// (if needed), commits a unified-diff patch file to a branch on that fork, and opens a
// fork-branch -> upstream-main pull request. The commit and PR are authored as the caller, not a bot.
public class GitHubProposalService
{
    private readonly GitHubConfig _config;

    public GitHubProposalService(IOptions<GitHubConfig> config) => _config = config.Value;

    public async Task<ProposalResultDto> CreateProposalAsync(
        string accessToken, string blobPath, string patchText, string commitMessage, string description)
    {
        var client = new GitHubClient(new ProductHeaderValue("About-me-Server"))
        {
            Credentials = new Credentials(accessToken)
        };

        var fork = await EnsureForkAsync(client);
        var upstreamRef = await client.Git.Reference.Get(_config.RepoOwner, _config.RepoName, "heads/main");

        var timestamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        var branchName = $"propose/{Slugify(blobPath)}-{timestamp}";
        var patchFilePath = $"patches/{blobPath}/{timestamp}.patch";

        await CreateBranchWithRetryAsync(client, fork.Owner.Login, fork.Name, branchName, upstreamRef.Object.Sha);

        await client.Repository.Content.CreateFile(
            fork.Owner.Login, fork.Name, patchFilePath,
            new CreateFileRequest(commitMessage, patchText, branchName));

        var body = string.IsNullOrWhiteSpace(description)
            ? $"Applies to `{blobPath}`."
            : $"Applies to `{blobPath}`.\n\n{description}";

        var pr = await client.PullRequest.Create(
            _config.RepoOwner, _config.RepoName,
            new NewPullRequest(commitMessage, $"{fork.Owner.Login}:{branchName}", "main") { Body = body });

        return new ProposalResultDto { PullRequestUrl = pr.HtmlUrl, BranchName = branchName };
    }

    private async Task<Repository> EnsureForkAsync(GitHubClient client)
    {
        var user = await client.User.Current();
        try
        {
            var existing = await client.Repository.Get(user.Login, _config.RepoName);
            if (existing.Fork) return existing;
        }
        catch (NotFoundException)
        {
            // Not forked yet — fall through and create one.
        }

        return await client.Repository.Forks.Create(_config.RepoOwner, _config.RepoName, new NewRepositoryFork());
    }

    private static async Task CreateBranchWithRetryAsync(
        GitHubClient client, string owner, string repo, string branchName, string sha)
    {
        const int maxAttempts = 5;
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                await client.Git.Reference.Create(owner, repo, new NewReference($"refs/heads/{branchName}", sha));
                return;
            }
            catch (Exception) when (attempt < maxAttempts)
            {
                // A freshly created fork can take a few seconds before git data operations succeed.
                await Task.Delay(TimeSpan.FromSeconds(2));
            }
        }
    }

    private static string Slugify(string path) =>
        path.Replace('/', '-').Replace(".md", string.Empty).ToLowerInvariant();
}

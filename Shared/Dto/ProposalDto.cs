using System.Text.Json.Serialization;

namespace Shared.Dto;

public class ProposalRequestDto
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;

    [JsonPropertyName("newContent")]
    public string NewContent { get; set; } = string.Empty;

    [JsonPropertyName("commitMessage")]
    public string CommitMessage { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;
}

public class ProposalResultDto
{
    [JsonPropertyName("pullRequestUrl")]
    public string PullRequestUrl { get; set; } = string.Empty;

    [JsonPropertyName("branchName")]
    public string BranchName { get; set; } = string.Empty;
}

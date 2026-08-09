using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Server.Services;
using Shared.Dto;

namespace Server.Controllers;

[ApiController]
[Route("api/proposals")]
public class ProposalsController : ControllerBase
{
    // A path that doesn't exist in blob yet is only ever allowed as a *new* proposal (rather than
    // a 404) when it looks like a brand-new blog post — keeps "create" narrowly scoped to what the
    // "Add new article" UI actually produces, instead of silently creating arbitrary blob paths.
    private static readonly Regex NewBlogPostPath = new(@"^blog/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$");

    private readonly BlobStorageService _blob;
    private readonly AuthSessionStore _sessions;
    private readonly DiffService _diff;
    private readonly GitHubProposalService _proposals;

    public ProposalsController(
        BlobStorageService blob, AuthSessionStore sessions, DiffService diff, GitHubProposalService proposals)
    {
        _blob = blob;
        _sessions = sessions;
        _diff = diff;
        _proposals = proposals;
    }

    // POST /api/proposals — opens a PR proposing `newContent` for the page at `path`.
    [HttpPost]
    public async Task<ActionResult<ProposalResultDto>> Create([FromBody] ProposalRequestDto request)
    {
        var sessionId = Request.Headers[AuthSessionStore.SessionHeaderName].FirstOrDefault();
        var session = _sessions.GetSession(sessionId);
        if (session is null)
            return Unauthorized(new { error = "Sign in with GitHub to propose changes." });

        if (string.IsNullOrWhiteSpace(request.Path) || string.IsNullOrWhiteSpace(request.CommitMessage))
            return BadRequest(new { error = "path and commitMessage are required." });

        // The diff base always comes from the live blob, never from the client, so a proposal
        // can't be crafted to claim a different starting point than what's actually deployed.
        var currentContent = await _blob.GetTextAsync(request.Path);
        if (currentContent is null)
        {
            if (!NewBlogPostPath.IsMatch(request.Path))
                return NotFound(new { error = $"Page '{request.Path}' not found." });

            currentContent = string.Empty;
        }

        // Normalize before diffing: blob content can carry CRLF from earlier Windows-authored
        // uploads while the browser editor yields LF, and diffing across mismatched EOL styles
        // flags unrelated context lines as changed too — GNU patch then rejects the hunk with
        // "different line endings" even though the intended edit itself applies cleanly.
        var normalizedOld = NormalizeLineEndings(currentContent);
        var normalizedNew = NormalizeLineEndings(request.NewContent ?? string.Empty);

        var patch = _diff.CreateUnifiedDiff(normalizedOld, normalizedNew, request.Path);
        if (string.IsNullOrEmpty(patch))
            return BadRequest(new { error = "No changes to propose." });

        try
        {
            var result = await _proposals.CreateProposalAsync(
                session.AccessToken, request.Path, patch, request.CommitMessage, request.Description ?? string.Empty);
            return Ok(result);
        }
        catch (Octokit.ApiException ex)
        {
            return StatusCode(502, new { error = $"GitHub rejected the proposal: {ex.Message}" });
        }
    }

    private static string NormalizeLineEndings(string text) => text.Replace("\r\n", "\n").Replace("\r", "\n");
}

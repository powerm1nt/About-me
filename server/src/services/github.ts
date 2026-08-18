/**
 * Opens a proposal PR using the caller's own GitHub token: forks if needed, commits a patch file to
 * a branch on that fork, and opens a PR against upstream. Authored as the caller, not a bot.
 */
import { Octokit } from "@octokit/rest";
import { config } from "../config.js";

export interface ProposalResult {
  pullRequestUrl: string;
  branchName: string;
}

/** Thrown when GitHub itself rejects the request, so the route can answer 502 rather than 500. */
export class GitHubApiError extends Error {}

const slugify = (path: string): string => path.replace(/\//g, "-").replace(/\.md/g, "").toLowerCase();

export async function createProposal(
  accessToken: string,
  contentPath: string,
  patchText: string,
  commitMessage: string,
  description: string
): Promise<ProposalResult> {
  const octokit = new Octokit({ auth: accessToken, userAgent: "About-me-Server" });

  try {
    const fork = await ensureFork(octokit);
    const upstreamRef = await octokit.git.getRef({
      owner: config.github.repoOwner,
      repo: config.github.repoName,
      ref: "heads/main",
    });

    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");
    const branchName = `propose/${slugify(contentPath)}-${timestamp}`;
    const patchFilePath = `patches/${contentPath}/${timestamp}.patch`;

    await createBranchWithRetry(octokit, fork.owner, fork.name, branchName, upstreamRef.data.object.sha);

    await octokit.repos.createOrUpdateFileContents({
      owner: fork.owner,
      repo: fork.name,
      path: patchFilePath,
      message: commitMessage,
      content: Buffer.from(patchText, "utf8").toString("base64"),
      branch: branchName,
    });

    const body = description.trim()
      ? `Applies to \`${contentPath}\`.\n\n${description}`
      : `Applies to \`${contentPath}\`.`;

    const pr = await octokit.pulls.create({
      owner: config.github.repoOwner,
      repo: config.github.repoName,
      title: commitMessage,
      head: `${fork.owner}:${branchName}`,
      base: "main",
      body,
    });

    return { pullRequestUrl: pr.data.html_url, branchName };
  } catch (error) {
    throw new GitHubApiError(error instanceof Error ? error.message : String(error));
  }
}

async function ensureFork(octokit: Octokit): Promise<{ owner: string; name: string }> {
  const { data: user } = await octokit.users.getAuthenticated();

  try {
    const { data: existing } = await octokit.repos.get({
      owner: user.login,
      repo: config.github.repoName,
    });
    if (existing.fork) return { owner: existing.owner.login, name: existing.name };
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
    // Not forked yet — fall through and create one.
  }

  const { data: fork } = await octokit.repos.createFork({
    owner: config.github.repoOwner,
    repo: config.github.repoName,
  });
  return { owner: fork.owner.login, name: fork.name };
}

async function createBranchWithRetry(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  sha: string
): Promise<void> {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha });
      return;
    } catch (error) {
      // A fresh fork takes a few seconds before git data operations succeed.
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

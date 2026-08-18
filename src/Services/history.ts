/**
 * Reconstructs a page's edit history from the repo's patches/ folder. Runs entirely in the browser:
 * the GitHub REST API and raw.githubusercontent.com both allow anonymous cross-origin GETs.
 */

const OWNER = "powerm1nt";
const REPO = "About-me";

export interface RevisionSummary {
  sha: string;
  message: string;
  authorLogin: string;
  authorAvatarUrl: string;
  date: string;
  htmlUrl: string;
}

export type DiffLineType = "context" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

/** One `@@ ... @@` hunk from a unified diff. */
export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

/** The markdown as it stood before this hunk — context + removed lines. */
export const hunkOldText = (hunk: DiffHunk): string =>
  hunk.lines.filter((l) => l.type !== "added").map((l) => l.text).join("\n");

/** The markdown as it stands after this hunk — context + added lines. */
export const hunkNewText = (hunk: DiffHunk): string =>
  hunk.lines.filter((l) => l.type !== "removed").map((l) => l.text).join("\n");

interface GitHubCommitListItem {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
  author: { login: string; avatar_url: string } | null;
  html_url: string;
}

interface GitHubCommitDetail extends GitHubCommitListItem {
  files: { filename: string }[];
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

/**
 * Commits that touched patches/{docPath}/ — one entry per merged proposal for this page, newest
 * first. The commit message here is the visitor's own "commit message" from the editor.
 */
export async function getRevisions(docPath: string): Promise<RevisionSummary[]> {
  const url =
    `https://api.github.com/repos/${OWNER}/${REPO}/commits` +
    `?path=${encodeURIComponent(`patches/${docPath}`)}&per_page=50`;

  const items = (await getJson<GitHubCommitListItem[]>(url)) ?? [];

  return items
    .map((i) => ({
      sha: i.sha,
      message: i.commit.message,
      authorLogin: i.author?.login ?? i.commit.author.name,
      authorAvatarUrl: i.author?.avatar_url ?? "",
      date: i.commit.author.date,
      htmlUrl: i.html_url,
    }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/**
 * Looks up which patch file a given commit added/changed for this doc, fetches its raw content,
 * and parses it into hunks.
 */
export async function getRevisionDiff(sha: string, docPath: string): Promise<DiffHunk[]> {
  const detail = await getJson<GitHubCommitDetail>(
    `https://api.github.com/repos/${OWNER}/${REPO}/commits/${sha}`
  );

  const prefix = `patches/${docPath}/`;
  const file = detail?.files?.find(
    (f) => f.filename.startsWith(prefix) && f.filename.endsWith(".patch")
  );
  if (!file) return [];

  // Not the API's own `raw_url`: its intermediate 302 sends an empty Access-Control-Allow-Origin.
  const rawUrl =
    `https://raw.githubusercontent.com/${OWNER}/${REPO}/${sha}/` +
    file.filename.split("/").map(encodeURIComponent).join("/");

  const response = await fetch(rawUrl);
  if (!response.ok) return [];
  return parseUnifiedDiff(await response.text());
}

/** Parses the unified-diff text produced by Server's DiffService back into hunks for display. */
export function parseUnifiedDiff(patchText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;

  for (const rawLine of patchText.replace(/\r\n/g, "\n").split("\n")) {
    if (rawLine.startsWith("---") || rawLine.startsWith("+++")) continue;

    if (rawLine.startsWith("@@")) {
      current = { header: rawLine, lines: [] };
      hunks.push(current);
      continue;
    }

    if (!current) continue;

    if (rawLine.startsWith("+")) current.lines.push({ type: "added", text: rawLine.slice(1) });
    else if (rawLine.startsWith("-")) current.lines.push({ type: "removed", text: rawLine.slice(1) });
    else if (rawLine.startsWith(" ")) current.lines.push({ type: "context", text: rawLine.slice(1) });
    // anything else, including the trailing empty split element, is ignored
  }

  return hunks;
}

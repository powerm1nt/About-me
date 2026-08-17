import { apiUrl } from "./config";
import type { ArticleMetadata, Page, PageRaw, ProposalResult } from "./types";

/** Header carrying the opaque proposal session id; the GitHub token itself never leaves Server. */
export const SESSION_HEADER = "X-Proposal-Session";

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // Not a JSON problem document — fall through to the status code below.
  }
  return `HTTP ${response.status}`;
}

export async function fetchPage(path: string): Promise<Page> {
  const response = await fetch(apiUrl(`/api/pages?path=${encodeURIComponent(path)}`));
  if (!response.ok) throw new Error(`Could not load '${path}' (HTTP ${response.status})`);
  return (await response.json()) as Page;
}

export async function fetchRawPage(path: string): Promise<PageRaw> {
  const response = await fetch(apiUrl(`/api/pages/raw?path=${encodeURIComponent(path)}`));
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as PageRaw;
}

export async function fetchArticles(): Promise<ArticleMetadata[]> {
  const response = await fetch(apiUrl("/api/pages/articles"));
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as ArticleMetadata[];
}

/** Renders arbitrary markdown through the same pipeline as a live page, so Preview matches exactly. */
export async function previewMarkdown(markdown: string): Promise<string> {
  const response = await fetch(apiUrl("/api/pages/preview"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const result = (await response.json()) as { html: string };
  return result.html ?? "";
}

export async function createProposal(
  sessionId: string | null,
  body: { path: string; newContent: string; commitMessage: string; description: string }
): Promise<ProposalResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionId) headers[SESSION_HEADER] = sessionId;

  const response = await fetch(apiUrl("/api/proposals"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as ProposalResult;
}

import { apiUrl } from "./config";
import type { ArticleMetadata, Page, PageRaw, PageRevision } from "./types";

/** The API's problem document if there is one, so the UI can show why a write was refused. */
export async function readErrorMessage(response: Response): Promise<string> {
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

export async function fetchRawPage(path: string): Promise<PageRaw> {
  const response = await fetch(apiUrl(`/api/pages/raw?path=${encodeURIComponent(path)}`));
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as PageRaw;
}

/**
 * Saves markdown straight to the bucket. `commitMessage` is not ceremony left over from the pull
 * request flow: it is stored on the object and is what gives each revision a label in the history.
 */
export async function savePage(body: {
  path: string;
  content: string;
  commitMessage: string;
  description: string;
}): Promise<void> {
  const response = await fetch(apiUrl("/api/pages"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

/** Every stored revision of a page, newest first. */
export async function fetchPageHistory(path: string): Promise<PageRevision[]> {
  const response = await fetch(apiUrl(`/api/pages/history?path=${encodeURIComponent(path)}`));
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as PageRevision[];
}

/** The stored bytes of one revision. */
export async function fetchPageVersion(path: string, generation: string): Promise<string> {
  const response = await fetch(
    apiUrl(`/api/pages/version?path=${encodeURIComponent(path)}&generation=${encodeURIComponent(generation)}`)
  );
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const body = (await response.json()) as { rawContent: string };
  return body.rawContent ?? "";
}

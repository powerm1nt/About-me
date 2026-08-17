// Mirrors the Server's Shared/Dto contracts. ASP.NET serializes with camelCase by default, and
// the DTOs that need a different name carry an explicit [JsonPropertyName] — either way what
// lands on the wire is exactly what's declared here.

export interface PageMeta {
  title: string;
  description: string;
  author: string;
  lastEdited: string;
}

export interface Page {
  path: string;
  content: string;
  renderedHtml: string;
  contentType: string;
  found: boolean;
  meta: PageMeta;
}

export interface PageRaw {
  path: string;
  rawContent: string;
  found: boolean;
}

export interface ArticleMetadata {
  filePath: string;
  title: string;
  description: string;
  author: string;
  lastEdited: string;
  lastEditedIso: string;
  created: string;
}

export interface AuthUser {
  login: string;
  avatarUrl: string;
  /** GitHub's display name; empty when the user hasn't set one, in which case `login` is the fallback. */
  name: string;
}

export interface BingWallpaper {
  imageUrl: string;
  title: string;
  copyright: string;
  date: string;
}

export interface ProposalResult {
  pullRequestUrl: string;
  branchName: string;
}

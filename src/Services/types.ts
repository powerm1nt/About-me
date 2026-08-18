// Mirrors the API's response contracts in server/src.

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
  /** Empty when the user hasn't set one; fall back to `login`. */
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

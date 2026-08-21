import { Router } from "express";
import { pageCache } from "../services/cache.js";
import {
  containerBaseUrl,
  getText,
  getTextAtGeneration,
  getTextWithMetadata,
  listObjects,
  listVersions,
  saveText,
} from "../services/storage.js";
import { displayName, getViewer } from "../services/identity.js";
import { consumeQuota } from "../services/rateLimit.js";
import { formatLastEdited, parseFrontmatter, renderRawText, type PageMeta } from "../markdown.js";

export const pagesRouter = Router();

/** Browser freshness is short; the shared CDN can absorb public reads for five minutes. */
const BROWSER_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=60";

interface PageDto {
  path: string;
  content: string;
  renderedHtml: string;
  contentType: string;
  found: boolean;
  meta: PageMeta;
}

interface ArticleMetadataDto {
  filePath: string;
  title: string;
  description: string;
  author: string;
  lastEdited: string;
  lastEditedIso: string;
  created: string;
}

const normalizePath = (path: string): string => path.replace(/\.mdx$/, ".md");
const byteLength = (text: string): number => Buffer.byteLength(text, "utf8");

// GET /api/pages?path=README.md
pagesRouter.get("/", async (req, res, next) => {
  try {
    const requested = typeof req.query.path === "string" ? req.query.path : "README.md";
    const path = normalizePath(requested);
    const cacheKey = `page:${path}`;

    let page = pageCache.get(cacheKey) as PageDto | undefined;

    if (!page) {
      const { content: rawText, lastModified } = await getTextWithMetadata(path);
      if (rawText === null) {
        res.status(404).json({ error: `Page '${path}' not found.` });
        return;
      }

      const { meta, html } = renderRawText(rawText, containerBaseUrl);
      const { content: markdown } = parseFrontmatter(rawText);
      meta.lastEdited = formatLastEdited(lastModified);

      page = {
        path,
        content: markdown,
        renderedHtml: html,
        contentType: "text/markdown",
        found: true,
        meta,
      };

      pageCache.set(cacheKey, page, byteLength(html) + byteLength(markdown));
    }

    res.setHeader("Cache-Control", BROWSER_CACHE_CONTROL);
    res.json(page);
  } catch (error) {
    next(error);
  }
});

/** Pages a signed-in account may write: the two home pages and blog articles. Nothing else. */
const WRITABLE_PATH = /^(README(\.ja)?\.md|blog\/[a-z0-9]+(-[a-z0-9]+)*(\.ja)?\.md)$/;

const MAX_CONTENT_BYTES = 512 * 1024;
const MAX_MESSAGE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const EDITS_PER_HOUR = 30;

/**
 * PUT /api/pages — saves markdown straight to the bucket.
 *
 * This replaced the patch-and-pull-request flow. The commit message did not go with it: it is
 * written into the object's own custom metadata, which is what gives the version history below an
 * author and a message for each generation. Bucket versioning keeps the previous bytes.
 */
pagesRouter.put("/", async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    if (!viewer) {
      res.status(401).json({ error: "Sign in to edit this page." });
      return;
    }

    const path = normalizePath(typeof req.body?.path === "string" ? req.body.path : "");
    if (!WRITABLE_PATH.test(path)) {
      res.status(400).json({ error: "That is not an editable page path." });
      return;
    }

    const content = typeof req.body?.content === "string" ? req.body.content : "";
    const commitMessage = (typeof req.body?.commitMessage === "string" ? req.body.commitMessage : "")
      .trim()
      .slice(0, MAX_MESSAGE_LENGTH);
    const description = (typeof req.body?.description === "string" ? req.body.description : "")
      .trim()
      .slice(0, MAX_DESCRIPTION_LENGTH);

    if (!content.trim()) {
      res.status(400).json({ error: "The page cannot be saved empty." });
      return;
    }
    if (!commitMessage) {
      res.status(400).json({ error: "Describe the change in the message field." });
      return;
    }
    if (byteLength(content) > MAX_CONTENT_BYTES) {
      res.status(413).json({ error: "That page is too large to save." });
      return;
    }

    if (!consumeQuota(`pages:edit:${viewer.id}`, EDITS_PER_HOUR, 60 * 60 * 1000)) {
      res.status(429).json({ error: "Edit limit reached. Try again later." });
      return;
    }

    await saveText(path, content, {
      contentType: "text/markdown; charset=utf-8",
      // Pages are read through the CDN, and an edit has to be visible promptly.
      cacheControl: "public, max-age=60",
      customMetadata: {
        editorId: viewer.id,
        editorName: displayName(viewer),
        commitMessage,
        description,
        editedAt: new Date().toISOString(),
      },
    });

    // The rendered page and the article list both go stale the moment the bytes change. Other
    // instances still hold their own copies until the five-minute TTL expires.
    pageCache.delete(`page:${path}`);
    pageCache.delete("articles");

    res.json({ path, saved: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pages/history?path=blog/welcome.md — one entry per stored generation, newest first.
 *
 * Replaces the old reconstruction from the repository's patches/ folder. Entries written before
 * versioning was switched on simply do not exist, and entries saved by any route other than the one
 * above carry no author.
 */
pagesRouter.get("/history", async (req, res, next) => {
  try {
    const path = normalizePath(typeof req.query.path === "string" ? req.query.path : "");
    if (!path) {
      res.status(400).json({ error: "path is required." });
      return;
    }

    const versions = await listVersions(path);

    res.json(
      versions.map((version) => ({
        generation: version.generation,
        date: version.metadata.editedAt || version.updated,
        message: version.metadata.commitMessage || "",
        description: version.metadata.description || "",
        authorName: version.metadata.editorName || "",
        sizeBytes: version.sizeBytes,
      }))
    );
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pages/version?path=…&generation=… — the stored bytes of one generation, so the history
 * view can show a revision beside the one before it.
 */
pagesRouter.get("/version", async (req, res, next) => {
  try {
    const path = normalizePath(typeof req.query.path === "string" ? req.query.path : "");
    const generation = typeof req.query.generation === "string" ? req.query.generation : "";

    if (!path || !/^\d+$/.test(generation)) {
      res.status(400).json({ error: "path and a numeric generation are required." });
      return;
    }

    const rawContent = await getTextAtGeneration(path, generation);
    if (rawContent === null) {
      res.status(404).json({ error: "That revision no longer exists." });
      return;
    }

    res.json({ path, generation, rawContent });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pages/raw?path=blog/welcome.md — byte-for-byte stored content, frontmatter included, so
 * the editor's diff targets the exact source the patch will be applied to.
 */
pagesRouter.get("/raw", async (req, res, next) => {
  try {
    const requested = typeof req.query.path === "string" ? req.query.path : "";
    const path = normalizePath(requested);
    const rawContent = await getText(path);

    if (rawContent === null) {
      res.status(404).json({ error: `Page '${path}' not found.` });
      return;
    }

    res.json({ path, rawContent, found: true });
  } catch (error) {
    next(error);
  }
});

/** POST /api/pages/preview — the same pipeline as the live page route, for the editor's Preview. */
pagesRouter.post("/preview", (req, res) => {
  const markdown = typeof req.body?.markdown === "string" ? req.body.markdown : "";
  const { html } = renderRawText(markdown, containerBaseUrl);
  res.json({ html });
});

// GET /api/pages/articles
pagesRouter.get("/articles", async (_req, res, next) => {
  try {
    const cacheKey = "articles";
    let articles = pageCache.get(cacheKey) as ArticleMetadataDto[] | undefined;

    if (!articles) {
      articles = [];

      for (const objectName of await listObjects("blog/")) {
        const lower = objectName.toLowerCase();
        if (!lower.endsWith(".md") && !lower.endsWith(".mdx")) continue;

        const filePath = normalizePath(objectName);
        if (filePath === "blog/index.md" || filePath === "blog/index.ja.md") continue;

        const { content: text, lastModified } = await getTextWithMetadata(objectName);
        if (text === null) continue;

        const { meta } = parseFrontmatter(text);
        articles.push({
          filePath,
          title: meta.title || filePath.replace(/^.*\//, "").replace(/\.[^.]+$/, ""),
          description: meta.description,
          author: meta.author,
          lastEdited: formatLastEdited(lastModified),
          lastEditedIso: lastModified?.toISOString() ?? "",
          created: "",
        });
      }

      articles.sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));

      const sizeBytes = articles.reduce(
        (total, a) =>
          total +
          byteLength(a.filePath) +
          byteLength(a.title) +
          byteLength(a.description) +
          byteLength(a.author) +
          byteLength(a.lastEdited),
        0
      );
      pageCache.set(cacheKey, articles, sizeBytes);
    }

    res.setHeader("Cache-Control", BROWSER_CACHE_CONTROL);
    res.json(articles);
  } catch (error) {
    next(error);
  }
});

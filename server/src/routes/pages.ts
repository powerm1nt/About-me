import { Router } from "express";
import { pageCache } from "../services/cache.js";
import { containerBaseUrl, getText, getTextWithMetadata, listObjects } from "../services/storage.js";
import { formatLastEdited, parseFrontmatter, renderRawText, type PageMeta } from "../markdown.js";

export const pagesRouter = Router();

/**
 * Content only changes via merged GitHub proposals, so a short server-side cache plus a matching
 * browser Cache-Control both meaningfully cut object reads and renders without making an edit feel
 * stuck for long.
 */
const BROWSER_CACHE_CONTROL = "public, max-age=60";

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

/**
 * GET /api/pages/raw?path=blog/welcome.md — byte-for-byte stored content, frontmatter included.
 * The editor diffs against this so a proposed patch targets the exact source it will be applied to.
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

/**
 * POST /api/pages/preview — renders arbitrary raw markdown through the same pipeline as the live
 * page route, so the editor's Preview tab matches the published result exactly.
 */
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

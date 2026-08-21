import { Router } from "express";
import { prisma } from "../services/prisma.js";
import { getViewer } from "../services/identity.js";
import { renderUserContent } from "../services/userContent.js";
import { parseFrontmatter } from "../markdown.js";
import { randomBytes } from "node:crypto";

export const pagesRouter = Router();

const normalizePath = (path: string): string => path.replace(/\.mdx$/, ".md");

// GET /api/pages?path=...&author=...
pagesRouter.get("/", async (req, res) => {
  const requested = typeof req.query.path === "string" ? req.query.path : "README.md";
  const path = normalizePath(requested);
  const authorHandle = req.query.author as string | undefined;

  if (!authorHandle) {
    return res.status(404).json({ error: "Author required" });
  }

  const profile = await prisma.profile.findUnique({
    where: { handle: authorHandle },
    include: { user: true },
  });

  if (!profile) {
    return res.status(404).json({ error: "Author not found" });
  }

  if (path.startsWith("posts/")) {
    const slug = path.replace("posts/", "").replace(/\.md$/, "");
    const post = await prisma.post.findUnique({
      where: { authorId_slug: { authorId: profile.userId, slug } },
    });
    if (!post) return res.status(404).json({ error: "Page not found" });

    return res.json({
      path,
      content: post.body,
      renderedHtml: post.renderedHtml,
      contentType: "text/markdown",
      found: true,
      meta: {
        title: post.title || slug,
        description: "",
        author: profile.user.name,
        lastEdited: post.updatedAt.toISOString(),
      },
    });
  } else {
    const slug = path.replace(/\.md$/, "");
    const page = await prisma.profilePage.findUnique({
      where: { userId_slug: { userId: profile.userId, slug } },
    });
    if (!page) return res.status(404).json({ error: "Page not found" });

    return res.json({
      path,
      content: page.body,
      renderedHtml: page.renderedHtml,
      contentType: "text/markdown",
      found: true,
      meta: {
        title: page.title || slug,
        description: "",
        author: profile.user.name,
        lastEdited: page.updatedAt.toISOString(),
      },
    });
  }
});

// GET /api/pages/articles?author=...
pagesRouter.get("/articles", async (req, res) => {
  const authorHandle = req.query.author as string | undefined;
  if (!authorHandle) return res.json([]);

  const posts = await prisma.post.findMany({
    where: { author: { profile: { handle: authorHandle } }, slug: { not: null } },
    orderBy: { publishedAt: "desc" },
  });

  const list = posts.map((post) => ({
    slug: post.slug,
    isHome: false,
    title: post.title || post.slug,
    description: "",
    author: authorHandle,
    lastEdited: post.updatedAt.toISOString().split("T")[0],
    lastEditedIso: post.updatedAt.toISOString(),
    created: post.createdAt.toISOString().split("T")[0],
  }));

  return res.json(list);
});

// GET /api/pages/raw?path=...&author=...
pagesRouter.get("/raw", async (req, res) => {
  const path = typeof req.query.path === "string" ? req.query.path : "";
  const authorHandle = req.query.author as string | undefined;

  if (!authorHandle) return res.status(404).json({ error: "Author required" });

  const profile = await prisma.profile.findUnique({
    where: { handle: authorHandle },
  });

  if (!profile) return res.status(404).json({ error: "Author not found" });

  let body = "";
  if (path.startsWith("posts/")) {
    const slug = path.replace("posts/", "").replace(/\.md$/, "");
    const post = await prisma.post.findUnique({
      where: { authorId_slug: { authorId: profile.userId, slug } },
    });
    if (post) body = post.body;
  } else {
    const slug = path.replace(/\.md$/, "");
    const page = await prisma.profilePage.findUnique({
      where: { userId_slug: { userId: profile.userId, slug } },
    });
    if (page) body = page.body;
  }

  return res.json({ path, rawContent: body, found: body !== "" });
});

// GET /api/pages/history?path=...&author=...
pagesRouter.get("/history", async (req, res) => {
  // We no longer have bucket history, return empty
  return res.json([]);
});

// POST /api/pages/preview
pagesRouter.post("/preview", async (req, res) => {
  const { markdown } = req.body;
  if (typeof markdown !== "string") return res.status(400).json({ error: "markdown required" });
  const rendered = renderUserContent(markdown, { scopeSelector: `.post-content` });
  return res.json({ html: rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : "") });
});

// PUT /api/pages - Save page (legacy support for PageEditor)
pagesRouter.put("/", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  // No commitMessage here any more: this route writes to Postgres, and the message only ever had a
  // home as custom metadata on the bucket object. See plan.md — page history still reads object
  // generations and therefore records nothing for content saved through this path.
  const { path, content } = req.body;
  if (!path || typeof content !== "string") return res.status(400).json({ error: "path and content required" });

  const rendered = renderUserContent(content, { scopeSelector: `.post-content` });
  const renderedHtml = rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : "");
  const { meta } = parseFrontmatter(content);

  if (path.startsWith("posts/")) {
    const slug = path.replace("posts/", "").replace(/\.md$/, "");
    await prisma.post.upsert({
      where: { authorId_slug: { authorId: viewer.id, slug } },
      update: { body: content, renderedHtml, title: meta.title || slug, updatedAt: new Date() },
      create: {
        id: randomBytes(6).toString("hex"),
        authorId: viewer.id,
        slug,
        title: meta.title || slug,
        body: content,
        renderedHtml,
        publishedAt: new Date(),
      },
    });
  } else {
    const slug = path.replace(/\.md$/, "");
    await prisma.profilePage.upsert({
      where: { userId_slug: { userId: viewer.id, slug } },
      update: { body: content, renderedHtml, title: meta.title || slug, updatedAt: new Date() },
      create: {
        id: randomBytes(6).toString("hex"),
        userId: viewer.id,
        slug,
        title: meta.title || slug,
        body: content,
        renderedHtml,
        isHome: slug === "README",
        inNav: true,
      },
    });
  }

  return res.sendStatus(204);
});

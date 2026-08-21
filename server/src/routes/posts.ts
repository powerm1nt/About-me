import { Router } from "express";
import { prisma } from "../services/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { getViewer } from "../services/identity.js";
import { consumeQuota } from "../services/rateLimit.js";
import { postScope, renderUserContent } from "../services/userContent.js";
import { randomBytes } from "node:crypto";

export const postsRouter = Router();

const generateId = () => randomBytes(6).toString("hex");

// GET /api/posts - Global or feed of posts
postsRouter.get("/", async (req, res) => {
  const authorHandle = req.query.author as string | undefined;

  const where = authorHandle
    ? { author: { profile: { handle: authorHandle } } }
    : {};

  const posts = await prisma.post.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, image: true, profile: { select: { handle: true } } } },
      media: true,
      _count: { select: { likes: true, comments: true, reposts: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return res.json({ posts });
});

// POST /api/posts - Create an article or text post
postsRouter.post("/", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  if (!consumeQuota(`post:create:${viewer.id}`, 50, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many posts. Try again later." });
  }

  const { body, title, slug } = req.body;
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Post body cannot be empty" });
  }

  // The id is minted first so the stylesheet can be scoped to this post specifically. Scoping every
  // post to one shared class would let any post restyle every other post shown beside it.
  const id = generateId();
  const rendered = renderUserContent(body, { scopeSelector: postScope(id) });

  const post = await prisma.post.create({
    data: {
      id,
      authorId: viewer.id,
      title: title || null,
      slug: slug || null,
      body,
      renderedHtml: rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : ""),
      publishedAt: new Date(),
    },
  });

  return res.status(201).json(post);
});

// GET /api/posts/resolve?slug=...&isHome=...&author=...
postsRouter.get("/resolve", async (req, res) => {
  const slug = typeof req.query.slug === "string" ? req.query.slug : "README";
  const isHome = req.query.isHome === "true";
  const authorHandle = req.query.author as string | undefined;

  if (!authorHandle) return res.status(404).json({ error: "Author required" });

  const profile = await prisma.profile.findUnique({
    where: { handle: authorHandle },
    include: { user: true },
  });

  if (!profile) return res.status(404).json({ error: "Author not found" });

  if (!isHome) {
    const post = await prisma.post.findUnique({
      where: { authorId_slug: { authorId: profile.userId, slug } },
    });
    if (!post) return res.status(404).json({ error: "Page not found" });

    return res.json({
      path: `posts/${slug}`,
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
    const page = await prisma.profilePage.findUnique({
      where: { userId_slug: { userId: profile.userId, slug } },
    });
    if (!page) return res.status(404).json({ error: "Page not found" });

    return res.json({
      path: slug,
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

// GET /api/posts/raw?slug=...&isHome=...&author=...
postsRouter.get("/raw", async (req, res) => {
  const slug = typeof req.query.slug === "string" ? req.query.slug : "README";
  const isHome = req.query.isHome === "true";
  const authorHandle = req.query.author as string | undefined;

  if (!authorHandle) return res.status(404).json({ error: "Author required" });

  const profile = await prisma.profile.findUnique({
    where: { handle: authorHandle },
  });

  if (!profile) return res.status(404).json({ error: "Author not found" });

  let body = "";
  if (!isHome) {
    const post = await prisma.post.findUnique({
      where: { authorId_slug: { authorId: profile.userId, slug } },
    });
    if (post) body = post.body;
  } else {
    const page = await prisma.profilePage.findUnique({
      where: { userId_slug: { userId: profile.userId, slug } },
    });
    if (page) body = page.body;
  }

  return res.json({ path: slug, rawContent: body, found: body !== "" });
});


// GET /api/posts/articles?author=...
postsRouter.get("/articles", async (req, res) => {
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

// GET /api/posts/:id - Get single post
postsRouter.get("/:id", async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: {
      author: { select: { id: true, name: true, image: true, profile: { select: { handle: true } } } },
      media: true,
      _count: { select: { likes: true, comments: true, reposts: true } },
    }
  });

  if (!post) return res.status(404).json({ error: "Post not found" });
  return res.json(post);
});

// GET /api/posts/slug/:slug - Get single post by slug
postsRouter.get("/slug/:slug", async (req, res) => {
  const authorHandle = req.query.author as string | undefined;

  const where: Prisma.PostWhereInput = { slug: req.params.slug };
  if (authorHandle) {
    where.author = { profile: { handle: authorHandle } };
  }

  const posts = await prisma.post.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, image: true, profile: { select: { handle: true } } } },
      media: true,
      _count: { select: { likes: true, comments: true, reposts: true } },
    },
    take: 1
  });

  if (posts.length === 0) return res.status(404).json({ error: "Post not found" });
  return res.json(posts[0]);
});

// PUT /api/posts/:id - Edit post
postsRouter.put("/:id", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.authorId !== viewer.id) return res.status(403).json({ error: "Forbidden" });

  const { body, title, slug } = req.body;
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Post body cannot be empty" });
  }

  const rendered = renderUserContent(body, { scopeSelector: postScope(post.id) });

  const updated = await prisma.post.update({
    where: { id: req.params.id },
    data: {
      title: title !== undefined ? title : post.title,
      slug: slug !== undefined ? slug : post.slug,
      body,
      renderedHtml: rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : ""),
    },
  });

  return res.json(updated);
});

// DELETE /api/posts/:id - Delete post
postsRouter.delete("/:id", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.authorId !== viewer.id) return res.status(403).json({ error: "Forbidden" });

  await prisma.post.delete({ where: { id: req.params.id } });
  return res.sendStatus(204);
});





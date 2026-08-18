import { Router } from "express";
import { getText } from "../services/storage.js";
import { SESSION_HEADER, getSession } from "../services/sessions.js";
import { createUnifiedDiff, normalizeLineEndings } from "../services/diff.js";
import { GitHubApiError, createProposal } from "../services/github.js";

export const proposalsRouter = Router();

/** Keeps "create" scoped to what the "Add new article" UI produces, not arbitrary object paths. */
const NEW_BLOG_POST_PATH = /^blog\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/;

// POST /api/proposals — opens a PR proposing `newContent` for the page at `path`.
proposalsRouter.post("/", async (req, res, next) => {
  try {
    const session = getSession(req.header(SESSION_HEADER) ?? undefined);
    if (!session) {
      res.status(401).json({ error: "Sign in with GitHub to propose changes." });
      return;
    }

    const path = typeof req.body?.path === "string" ? req.body.path : "";
    const commitMessage = typeof req.body?.commitMessage === "string" ? req.body.commitMessage : "";
    const newContent = typeof req.body?.newContent === "string" ? req.body.newContent : "";
    const description = typeof req.body?.description === "string" ? req.body.description : "";

    if (!path.trim() || !commitMessage.trim()) {
      res.status(400).json({ error: "path and commitMessage are required." });
      return;
    }

    // The diff base comes from live storage, never the client, so it can't claim a false base.
    let currentContent = await getText(path);
    if (currentContent === null) {
      if (!NEW_BLOG_POST_PATH.test(path)) {
        res.status(404).json({ error: `Page '${path}' not found.` });
        return;
      }
      currentContent = "";
    }

    const patch = createUnifiedDiff(
      normalizeLineEndings(currentContent),
      normalizeLineEndings(newContent),
      path
    );

    if (!patch) {
      res.status(400).json({ error: "No changes to propose." });
      return;
    }

    const result = await createProposal(
      session.accessToken,
      path,
      patch,
      commitMessage,
      description
    );
    res.json(result);
  } catch (error) {
    if (error instanceof GitHubApiError) {
      res.status(502).json({ error: `GitHub rejected the proposal: ${error.message}` });
      return;
    }
    next(error);
  }
});

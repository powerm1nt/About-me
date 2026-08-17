import { Router } from "express";
import { getText } from "../services/storage.js";
import { SESSION_HEADER, getSession } from "../services/sessions.js";
import { createUnifiedDiff, normalizeLineEndings } from "../services/diff.js";
import { GitHubApiError, createProposal } from "../services/github.js";

export const proposalsRouter = Router();

/**
 * A path that doesn't exist in storage yet is only ever accepted as a *new* proposal (rather than
 * answered with 404) when it looks like a brand-new blog post. That keeps "create" narrowly scoped
 * to what the "Add new article" UI actually produces, instead of letting a caller seed arbitrary
 * object paths.
 */
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

    // The diff base always comes from live storage, never from the client, so a proposal can't be
    // crafted to claim a different starting point than what's actually deployed.
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

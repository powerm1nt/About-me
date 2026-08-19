import { Router } from "express";
import { config } from "../config.js";
import {
  SESSION_HEADER,
  consumeState,
  createSession,
  createState,
  getSession,
  removeSession,
} from "../services/sessions.js";

export const authRouter = Router();

const USER_AGENT = "About-me-Server/1.0";

/** Trusted origins only, so the OAuth flow can't be used as an open redirect. */
function isAllowedReturnUrl(returnUrl: string | undefined): boolean {
  if (!returnUrl?.trim()) return false;

  let target: URL;
  try {
    target = new URL(returnUrl);
  } catch {
    return false;
  }

  return config.allowedOrigins.some((origin) => {
    try {
      const allowed = new URL(origin);
      return allowed.protocol === target.protocol && allowed.host === target.host;
    } catch {
      return false;
    }
  });
}

// GET /api/auth/github/login?returnUrl=https://blog.nuka.works/blog/welcome&resume=edit
authRouter.get("/github/login", (req, res) => {
  const returnUrl = typeof req.query.returnUrl === "string" ? req.query.returnUrl : undefined;
  const resume = typeof req.query.resume === "string" ? req.query.resume : null;

  if (!isAllowedReturnUrl(returnUrl)) {
    res.status(400).json({ error: "Invalid returnUrl." });
    return;
  }

  const state = createState({ returnUrl: returnUrl as string, resume });

  // Let GitHub use the callback URL registered on the OAuth app. Reflecting the request host here
  // couples sign-in to whichever Cloud Run or CDN hostname happened to receive the login request.
  const authorizeUrl =
    "https://github.com/login/oauth/authorize" +
    `?client_id=${encodeURIComponent(config.github.clientId)}` +
    "&scope=public_repo" +
    `&state=${state}`;

  res.redirect(authorizeUrl);
});

// GET /api/auth/github/callback?code=...&state=...
authRouter.get("/github/callback", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;

    const pending = consumeState(state);
    if (!pending) {
      res.status(400).json({ error: "Invalid or expired login attempt." });
      return;
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      res.status(502).json({ error: "GitHub token exchange failed." });
      return;
    }

    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      res.status(502).json({ error: "GitHub did not return an access token." });
      return;
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    const user = (await userResponse.json()) as { login?: string; avatar_url?: string; name?: string };
    if (!user.login) {
      res.status(502).json({ error: "Could not read GitHub user profile." });
      return;
    }

    const sessionId = createSession({
      accessToken: token.access_token,
      login: user.login,
      avatarUrl: user.avatar_url ?? "",
      name: user.name ?? "",
    });

    const separator = pending.returnUrl.includes("?") ? "&" : "?";
    const resumeParam = pending.resume ? `&resume=${encodeURIComponent(pending.resume)}` : "";
    res.redirect(`${pending.returnUrl}${separator}session=${sessionId}${resumeParam}`);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me — resolves the caller's GitHub identity from their session header.
authRouter.get("/me", (req, res) => {
  const session = getSession(req.header(SESSION_HEADER) ?? undefined);
  if (!session) {
    res.sendStatus(401);
    return;
  }

  res.json({ login: session.login, avatarUrl: session.avatarUrl, name: session.name });
});

// POST /api/auth/logout
authRouter.post("/logout", (req, res) => {
  removeSession(req.header(SESSION_HEADER) ?? undefined);
  res.sendStatus(204);
});

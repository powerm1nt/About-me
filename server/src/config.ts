/**
 * Runtime configuration, read once at startup. No storage credential: the API reaches GCS through
 * Application Default Credentials, so there is no key to leak.
 */

const env = (name: string, fallback = ""): string => process.env[name]?.trim() || fallback;

/** Object-name prefix every piece of content sits under, e.g. "static". */
const prefix = env("GCS_PREFIX", "static").replace(/^\/+|\/+$/g, "");

const cdnBaseUrl = env("CDN_BASE_URL").replace(/\/+$/, "");

export const config = {
  port: Number(env("PORT", "8080")),

  storage: {
    bucketName: env("GCS_BUCKET"),
    prefix,

    /**
     * Public base URL rendered markdown points its assets at. Falls back to storage.googleapis.com
     * when no CDN host is configured, so a local run still resolves images.
     */
    baseUrl: cdnBaseUrl
      ? `${cdnBaseUrl}/${prefix}`
      : `https://storage.googleapis.com/${env("GCS_BUCKET")}/${prefix}`,

    /** Maps a logical page path ("blog/welcome.md") to its full object name. */
    objectName: (path: string): string => {
      const clean = path.replace(/^\/+/, "");
      return prefix ? `${prefix}/${clean}` : clean;
    },

    /** Inverse of objectName: full object name back to a logical page path. */
    pagePath: (objectName: string): string =>
      prefix && objectName.startsWith(`${prefix}/`) ? objectName.slice(prefix.length + 1) : objectName,
  },

  github: {
    clientId: env("GITHUB_CLIENT_ID"),
    clientSecret: env("GITHUB_CLIENT_SECRET"),
    repoOwner: env("GITHUB_REPO_OWNER", "powerm1nt"),
    repoName: env("GITHUB_REPO_NAME", "About-me"),
  },

  /** Both the CORS allow-list and the OAuth returnUrl allow-list, so login can't open-redirect. */
  allowedOrigins: env(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,https://blog.nuka.works"
  )
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
} as const;

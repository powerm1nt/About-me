/**
 * Reads the site's markdown out of its Google Cloud Storage bucket.
 *
 * The client is built from Application Default Credentials, which on Cloud Run resolves to the
 * service's own service account — so there is no storage key in configuration, in the container,
 * or in CI.
 */
import { Storage } from "@google-cloud/storage";
import { config } from "../config.js";

const storage = new Storage();
const bucket = () => storage.bucket(config.storage.bucketName);

/** Public base URL rendered markdown links its assets at. */
export const containerBaseUrl = config.storage.baseUrl;

export interface TextWithMetadata {
  content: string | null;
  lastModified: Date | null;
}

/**
 * If the caller asks for .md, also try .mdx — the two extensions are used interchangeably in
 * published content and the frontend only ever routes to the .md form.
 */
function candidates(path: string): string[] {
  const result = [path];

  if (path.toLowerCase().endsWith(".ja.md")) {
    result.push(`${path.slice(0, -3)}.mdx`); // foo.ja.md → foo.ja.mdx
  } else if (path.toLowerCase().endsWith(".md")) {
    result.push(`${path}x`); // README.md → README.mdx
  }

  return result;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 404;
}

/**
 * Content plus the object's actual last-updated timestamp — the authoritative "last edited" date.
 * It can't be spoofed by a `lastEdited:` field in the markdown's own frontmatter.
 */
export async function getTextWithMetadata(path: string): Promise<TextWithMetadata> {
  for (const candidate of candidates(path)) {
    const file = bucket().file(config.storage.objectName(candidate));
    try {
      // download() does not populate file.metadata, so the timestamp has to be fetched explicitly.
      // Issued together rather than in sequence: the two are independent, and this route is on the
      // critical path for every page render that misses the cache.
      const [[contents], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);

      // `updated` is the GCS write time, which for migrated content is the day the migration ran,
      // not the day the page was actually last edited. The migration stamps the original Azure
      // timestamp into custom metadata, so prefer that when it's there. Any later edit rewrites the
      // object through `gcloud storage cp`, which drops custom metadata — so the fallback takes
      // over again exactly when `updated` becomes the truthful answer.
      const original = metadata.metadata?.originalLastModified;
      const timestamp = typeof original === "string" && original ? original : metadata.updated;

      return {
        content: contents.toString("utf8"),
        lastModified: timestamp ? new Date(timestamp) : null,
      };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      // Try the next candidate extension.
    }
  }

  return { content: null, lastModified: null };
}

export async function getText(path: string): Promise<string | null> {
  return (await getTextWithMetadata(path)).content;
}

/**
 * Live object names under an optional logical prefix (e.g. "blog/"), returned as page paths.
 *
 * Object versioning is deliberately not requested: only current versions are listed, so an
 * overwritten page can't show up twice.
 */
export async function listObjects(prefix = ""): Promise<string[]> {
  const [files] = await bucket().getFiles({ prefix: config.storage.objectName(prefix) });
  return files.map((file) => config.storage.pagePath(file.name));
}

/**
 * Reads the site's markdown out of its GCS bucket, authenticating through Application Default
 * Credentials so no storage key exists in configuration, the container, or CI.
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

/** Published content uses .md and .mdx interchangeably, but the frontend only routes to .md. */
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

/** Content plus the object's own timestamp, which frontmatter cannot spoof. */
export async function getTextWithMetadata(path: string): Promise<TextWithMetadata> {
  for (const candidate of candidates(path)) {
    const file = bucket().file(config.storage.objectName(candidate));
    try {
      // download() leaves file.metadata unpopulated. Issued together since they're independent.
      const [[contents], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);

      // `updated` is the GCS write time, which for migrated content is the migration date. The
      // migration stamped the original timestamp into custom metadata, and any later edit drops
      // that metadata — which is exactly when `updated` becomes truthful again.
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

/** Page paths under an optional prefix. Current versions only, so an overwrite can't list twice. */
export async function listObjects(prefix = ""): Promise<string[]> {
  const [files] = await bucket().getFiles({ prefix: config.storage.objectName(prefix) });
  return files.map((file) => config.storage.pagePath(file.name));
}

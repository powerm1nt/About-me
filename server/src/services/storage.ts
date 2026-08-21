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

export interface TextWithGeneration {
  content: string | null;
  /** GCS object generation, passed back to saveText as a precondition. null when absent. */
  generation: string | null;
}

/**
 * Reads an object together with its generation. Unlike getTextWithMetadata this does not try
 * alternate extensions: callers use it for JSON documents they also write, where the exact object
 * identity matters for the compare-and-swap in saveText.
 */
export async function getTextWithGeneration(path: string): Promise<TextWithGeneration> {
  const file = bucket().file(config.storage.objectName(path));

  try {
    const [[contents], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
    // The client types generation as string | number depending on the transport; normalise it,
    // since the value goes straight back out as a write precondition.
    const generation = metadata.generation;
    return {
      content: contents.toString("utf8"),
      generation: generation === undefined || generation === null ? null : String(generation),
    };
  } catch (error) {
    if (isNotFound(error)) return { content: null, generation: null };
    throw error;
  }
}

/** A generation precondition rejected the write: someone else changed the object first. */
export class PreconditionFailedError extends Error {}

/**
 * Writes text under a generation precondition. `expectedGeneration` of null means "must not exist
 * yet", which GCS expresses as ifGenerationMatch: 0. A mismatch throws PreconditionFailedError so
 * callers can re-read and retry rather than silently overwriting a concurrent edit.
 */
export async function saveText(
  path: string,
  contents: string,
  options: {
    contentType: string;
    cacheControl?: string;
    expectedGeneration?: string | null;
    /** Custom object metadata, e.g. who edited a page and the message they wrote for it. */
    customMetadata?: Record<string, string>;
  }
): Promise<void> {
  const file = bucket().file(config.storage.objectName(path));

  try {
    await file.save(contents, {
      contentType: options.contentType,
      resumable: false,
      metadata: {
        ...(options.cacheControl ? { cacheControl: options.cacheControl } : {}),
        ...(options.customMetadata ? { metadata: options.customMetadata } : {}),
      },
      ...(options.expectedGeneration === undefined
        ? {}
        : { preconditionOpts: { ifGenerationMatch: options.expectedGeneration ?? 0 } }),
    });
  } catch (error) {
    if (isPreconditionFailed(error)) {
      throw new PreconditionFailedError(`Object '${path}' changed during the write.`);
    }
    throw error;
  }
}

/** Writes binary content (a photo) at its public path. Immutable: the object name carries an id. */
export async function saveBinary(
  path: string,
  contents: Buffer,
  options: { contentType: string; cacheControl?: string }
): Promise<void> {
  const file = bucket().file(config.storage.objectName(path));

  await file.save(contents, {
    contentType: options.contentType,
    resumable: false,
    metadata: {
      cacheControl: options.cacheControl ?? "public, max-age=31536000, immutable",
    },
  });
}

/** Whether an object is present, without downloading it. */
export async function objectExists(path: string): Promise<boolean> {
  const [exists] = await bucket().file(config.storage.objectName(path)).exists();
  return exists;
}

/** Best-effort delete: a missing object is already the desired end state. */
export async function deleteObject(path: string): Promise<void> {
  await bucket().file(config.storage.objectName(path)).delete({ ignoreNotFound: true });
}

function isPreconditionFailed(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 412;
}

export interface ObjectVersion {
  generation: string;
  updated: string;
  sizeBytes: number;
  /** Custom metadata written at edit time: who saved it and the message they wrote. */
  metadata: Record<string, string>;
}

/**
 * Every stored generation of one object, newest first. Returns a single entry when the bucket has
 * versioning switched off, since the live object is then the only generation there has ever been.
 */
export async function listVersions(path: string): Promise<ObjectVersion[]> {
  const [files] = await bucket().getFiles({
    prefix: config.storage.objectName(path),
    versions: true,
  });

  const objectName = config.storage.objectName(path);

  return files
    // getFiles matches on prefix, so a sibling whose name merely starts the same must be dropped.
    .filter((file) => file.name === objectName)
    .map((file) => ({
      generation: String(file.metadata.generation ?? ""),
      updated: file.metadata.updated ?? "",
      sizeBytes: Number(file.metadata.size ?? 0),
      metadata: (file.metadata.metadata ?? {}) as Record<string, string>,
    }))
    .sort((a, b) => (a.generation < b.generation ? 1 : a.generation > b.generation ? -1 : 0));
}

/** One specific generation's content, for the side-by-side view in the page history. */
export async function getTextAtGeneration(path: string, generation: string): Promise<string | null> {
  const file = bucket().file(config.storage.objectName(path), { generation });

  try {
    const [contents] = await file.download();
    return contents.toString("utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

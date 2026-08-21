/**
 * The photo gallery's store. Two kinds of document live in the bucket alongside the images:
 *
 *   photos/index.json        the ordered manifest of posts
 *   photos/social/<id>.json  one post's likes and comments
 *
 * This module is the only thing that knows metadata lives in the bucket at all: the routes speak
 * in posts, likes, and comments. That seam is deliberate — post metadata is moving to Postgres
 * behind Prisma, and when it does, only the bodies of these functions change.
 *
 * They are separate objects on purpose. Every like and comment is a write, and folding them into
 * the manifest would make each of those contend with every other post's edits for the same
 * generation. Splitting them means contention only ever exists between two people acting on the
 * same post at the same instant.
 */
import { TtlCache } from "./cache.js";
import {
  PreconditionFailedError,
  deleteObject,
  getTextWithGeneration,
  saveText,
} from "./storage.js";

export interface PhotoAuthor {
  /** better-auth user id. Stable across the provider someone happens to sign in with. */
  id: string;
  name: string;
  /** Avatar URL, empty for accounts without one. */
  image: string;
}

export interface PhotoPost {
  id: string;
  /** Logical blob paths; the frontend joins them onto the CDN base itself. */
  full: string;
  thumb: string;
  width: number;
  height: number;
  caption: string;
  alt: string;
  tags: string[];
  author: PhotoAuthor;
  postedAt: string;
  editedAt: string;
}

export interface PhotoComment {
  id: string;
  author: PhotoAuthor;
  body: string;
  postedAt: string;
}

export interface PhotoSocial {
  /** User ids. A set keyed by identity, so liking twice is idempotent rather than additive. */
  likes: string[];
  comments: PhotoComment[];
}

export const MANIFEST_PATH = "photos/index.json";
export const MEDIA_PREFIX = "photos/media";

export const socialPath = (id: string): string => `photos/social/${id}.json`;
export const mediaPath = (id: string, variant: "full" | "thumb", ext: string): string =>
  `${MEDIA_PREFIX}/${id}${variant === "thumb" ? ".thumb" : ""}.${ext}`;

/**
 * Short by design: these documents change whenever anyone likes or comments, and the cache is
 * per-instance, so a long TTL would show one visitor a like count another instance has already
 * moved past. Long enough to absorb the burst of reads a single page load produces.
 */
const photoCache = new TtlCache<unknown>(15 * 1000, 4 * 1024 * 1024);

/** A read-modify-write can only lose to a concurrent writer so many times before it is a fault. */
const MAX_WRITE_ATTEMPTS = 4;

interface Versioned<T> {
  value: T;
  generation: string | null;
}

const EMPTY_SOCIAL: PhotoSocial = { likes: [], comments: [] };

function parseJson<T>(text: string | null, fallback: T): T {
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    // A hand-edited or truncated document must not take the whole gallery down with it.
    console.error("Malformed photo document in storage; falling back to empty.");
    return fallback;
  }
}

async function readDocument<T>(path: string, fallback: T, skipCache: boolean): Promise<Versioned<T>> {
  const cacheKey = `photos:${path}`;

  if (!skipCache) {
    const cached = photoCache.get(cacheKey) as Versioned<T> | undefined;
    if (cached) return cached;
  }

  const { content, generation } = await getTextWithGeneration(path);
  const document: Versioned<T> = { value: parseJson(content, fallback), generation };

  photoCache.set(cacheKey, document, content ? Buffer.byteLength(content, "utf8") : 1);
  return document;
}

/**
 * Compare-and-swap on one JSON document. `mutate` receives the current value and returns the next
 * one, or null to abort without writing. On a lost race the document is re-read past the cache and
 * the mutation is replayed against the newer value, so a like never erases a comment.
 */
async function updateDocument<T>(
  path: string,
  fallback: T,
  mutate: (current: T) => T | null
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const { value, generation } = await readDocument(path, fallback, attempt > 1);
    const next = mutate(value);
    if (next === null) return null;

    const serialized = `${JSON.stringify(next, null, 2)}\n`;

    try {
      await saveText(path, serialized, {
        contentType: "application/json",
        // These documents are read through the API, never the CDN, but a stale copy in any
        // intermediary would show the wrong like count, so they are explicitly uncacheable.
        cacheControl: "no-store",
        expectedGeneration: generation,
      });
    } catch (error) {
      if (error instanceof PreconditionFailedError && attempt < MAX_WRITE_ATTEMPTS) continue;
      throw error;
    }

    // The generation is unknown until the next read; drop the entry rather than cache a guess.
    photoCache.delete(`photos:${path}`);
    return next;
  }

  throw new PreconditionFailedError(`Gave up updating '${path}' after ${MAX_WRITE_ATTEMPTS} attempts.`);
}

export async function listPosts(): Promise<PhotoPost[]> {
  const { value } = await readDocument<PhotoPost[]>(MANIFEST_PATH, [], false);
  return value;
}

export async function getPost(id: string): Promise<PhotoPost | null> {
  return (await listPosts()).find((post) => post.id === id) ?? null;
}

/** Mutates the manifest under a precondition. Returns null when `mutate` aborted. */
export async function updatePosts(
  mutate: (posts: PhotoPost[]) => PhotoPost[] | null
): Promise<PhotoPost[] | null> {
  return updateDocument<PhotoPost[]>(MANIFEST_PATH, [], mutate);
}

export async function getSocial(id: string): Promise<PhotoSocial> {
  const { value } = await readDocument<PhotoSocial>(socialPath(id), EMPTY_SOCIAL, false);
  return { likes: value.likes ?? [], comments: value.comments ?? [] };
}

/** Social documents for several posts at once, for the gallery's like and comment counts. */
export async function getSocialMany(ids: string[]): Promise<Map<string, PhotoSocial>> {
  const entries = await Promise.all(
    ids.map(async (id) => [id, await getSocial(id)] as const)
  );
  return new Map(entries);
}

export async function updateSocial(
  id: string,
  mutate: (current: PhotoSocial) => PhotoSocial | null
): Promise<PhotoSocial | null> {
  return updateDocument<PhotoSocial>(socialPath(id), EMPTY_SOCIAL, (current) =>
    mutate({ likes: current.likes ?? [], comments: current.comments ?? [] })
  );
}

/** Drops a post's social document once the post itself is gone. */
export async function deleteSocial(id: string): Promise<void> {
  await deleteObject(socialPath(id));
  photoCache.delete(`photos:${socialPath(id)}`);
}

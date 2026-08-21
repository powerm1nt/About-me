#!/usr/bin/env tsx
/**
 * One-shot migration: reads the photo gallery's JSON store from the bucket and inserts it into
 * Postgres. Run inside the API container:
 *
 *   docker compose -f docker-compose.dev.yml exec -w /repo/server api pnpm exec tsx migrate-photos.ts
 *
 * Idempotent: upserts everywhere, so re-running it after a partial failure is safe.
 */
import { prisma } from "./src/services/prisma.js";
import { Storage } from "@google-cloud/storage";

const env = (name: string, fallback = ""): string => process.env[name]?.trim() || fallback;

const bucketName = env("GCS_BUCKET", "hisuiki-assets-prod");
const prefix = env("GCS_PREFIX", "static");
const apiEndpoint = env("GCS_API_ENDPOINT");

const storage = new Storage(apiEndpoint ? { apiEndpoint } : {});
const bucket = storage.bucket(bucketName);

const objectName = (path: string): string => {
  const clean = path.replace(/^\/+/, "");
  return prefix ? `${prefix}/${clean}` : clean;
};

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const [contents] = await bucket.file(objectName(path)).download();
    return JSON.parse(contents.toString("utf8")) as T;
  } catch {
    return fallback;
  }
}

interface BucketAuthor {
  id: string;
  name: string;
  image: string;
}

interface BucketPost {
  id: string;
  full: string;
  thumb: string;
  width: number;
  height: number;
  caption: string;
  alt: string;
  tags: string[];
  author: BucketAuthor;
  postedAt: string;
  editedAt: string;
}

interface BucketComment {
  id: string;
  author: BucketAuthor;
  body: string;
  postedAt: string;
}

interface BucketSocial {
  likes: string[];
  comments: BucketComment[];
}

async function ensureUser(author: BucketAuthor): Promise<void> {
  await prisma.user.upsert({
    where: { id: author.id },
    update: { name: author.name, image: author.image || null },
    create: {
      id: author.id,
      name: author.name,
      email: `${author.id}@migrated.local`,
      image: author.image || null,
    },
  });
}

async function main() {
  console.log("Reading photos/index.json from the bucket...");
  const posts = await readJson<BucketPost[]>("photos/index.json", []);
  console.log(`Found ${posts.length} posts.`);

  for (const post of posts) {
    console.log(`  -> ${post.id} by ${post.author.name}`);
    await ensureUser(post.author);

    await prisma.post.upsert({
      where: { id: post.id },
      update: {},
      create: {
        id: post.id,
        authorId: post.author.id,
        body: post.caption || "",
        publishedAt: new Date(post.postedAt),
        createdAt: new Date(post.postedAt),
        updatedAt: new Date(post.editedAt),
      },
    });

    const existingMedia = await prisma.postMedia.findUnique({ where: { id: post.id } });
    if (!existingMedia) {
      await prisma.postMedia.create({
        data: {
          id: post.id,
          postId: post.id,
          path: post.full,
          thumbPath: post.thumb,
          width: post.width || 0,
          height: post.height || 0,
          alt: post.alt || "",
        },
      });
    }

    const social = await readJson<BucketSocial>(`photos/social/${post.id}.json`, {
      likes: [],
      comments: [],
    });

    for (const userId of social.likes) {
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, name: "Unknown", email: `${userId}@migrated.local` },
      });

      await prisma.like
        .create({ data: { userId, postId: post.id } })
        .catch(() => {});
    }

    for (const comment of social.comments) {
      await ensureUser(comment.author);
      await prisma.comment
        .create({
          data: {
            id: comment.id,
            postId: post.id,
            authorId: comment.author.id,
            body: comment.body,
            createdAt: new Date(comment.postedAt),
          },
        })
        .catch(() => {});
    }
  }

  console.log(`\nDone — ${posts.length} posts migrated to Postgres.`);
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

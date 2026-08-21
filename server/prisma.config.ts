/**
 * Prisma 7 reads the connection URL from here rather than from schema.prisma, and only for the
 * commands that touch a live database — `migrate`, `db push`, `introspect`. `prisma generate` needs
 * no connection, which is what lets the Docker build generate the client before any database
 * exists, so the datasource is attached only when DATABASE_URL is actually set: `env()` throws on a
 * missing variable and would otherwise break the build.
 *
 * Prisma 7 does not read .env by itself. Export DATABASE_URL, or run the CLI through
 * `node --env-file=.env`, before any migrate command.
 */
import { defineConfig } from "prisma/config";

const url = process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});

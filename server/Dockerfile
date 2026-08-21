# Cloud Run image for the blog frontend and API. Built from the repository root, because the two
# packages share one image and the workspace lockfile pins both.
#
# Cloud Run hands the port to listen on in $PORT and terminates TLS itself, so the app binds plain
# HTTP on that port (see src/index.ts).
FROM node:24-slim AS build
WORKDIR /repo

# Installed directly rather than through `corepack enable`: corepack is deprecated in current Node,
# and it aborts outright under QEMU when this image is cross-built for linux/amd64 from an arm64
# host. Keep the version in step with "packageManager" in the root package.json.
RUN npm install -g pnpm@11.18.0

# Manifests first, so a dependency install is only re-run when the dependencies themselves change
# rather than on every source edit.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile

COPY index.html tsconfig.json vite.config.ts ./
COPY public/ public/
COPY src/ src/
COPY server/ server/

ARG VITE_API_BASE_URL=""
ARG VITE_ASSET_BASE_URL="https://storage.googleapis.com/hisuiki-assets-prod/static"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ASSET_BASE_URL=$VITE_ASSET_BASE_URL

RUN pnpm build
# The API's build runs `prisma generate` first: the generated client is gitignored, so it is not in
# the build context and has to be produced here. Generating needs no database connection.
RUN pnpm --filter aboutme-server build

# Resolves the workspace package into a self-contained directory with production dependencies only
# — no pnpm symlinks pointing outside it, and none of the frontend's build tooling.
#
# --legacy because pnpm 10+ otherwise refuses to deploy from a workspace that hasn't opted into
# injected dependencies. Injecting them would only matter if this package depended on another
# workspace package; it doesn't, so the legacy (node_modules-copying) behaviour is exactly right.
RUN pnpm deploy --legacy --filter aboutme-server --prod /app

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Drop root: nothing here writes to disk at runtime, so the process has no reason to own its files.
COPY --from=build --chown=node:node /app ./
COPY --from=build --chown=node:node /repo/dist ./web/
USER node

ENV PORT=8080
ENV WEB_ROOT=/app/web
EXPOSE 8080

CMD ["node", "dist/index.js"]

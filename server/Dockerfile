# Cloud Run image for the API. Built from the repository root, because the server is a pnpm
# workspace package and the lockfile that pins its dependencies lives there.
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
RUN pnpm install --frozen-lockfile --filter aboutme-server

COPY server/ server/
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
USER node

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]

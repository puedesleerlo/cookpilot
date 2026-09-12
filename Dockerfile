# Lives at the repo root because that is the build context: the API is one workspace in a
# pnpm monorepo and cannot be built from its own directory alone.
#
# Build and run the API from the monorepo root. pnpm's workspace layout means the build
# needs the lockfile and every package manifest before it can install anything, so the
# manifests are copied on their own first — a source edit then leaves the install layer
# cached. No BuildKit cache mounts: Cloud Build's docker builder does not enable BuildKit,
# and layer caching gets most of the benefit anyway.
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
COPY packages/scheduler/package.json packages/scheduler/
COPY packages/recipes/package.json packages/recipes/
RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter @kitchen/api exec tsc -b --force

# Only what runs. The build image carries the toolchain; this one carries the server.
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

COPY --from=build /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/packages/domain/package.json packages/domain/
COPY --from=build /repo/packages/contracts/package.json packages/contracts/
COPY --from=build /repo/packages/scheduler/package.json packages/scheduler/
COPY --from=build /repo/packages/recipes/package.json packages/recipes/
RUN pnpm install --frozen-lockfile --prod

# The server runs from TypeScript source, so the runtime needs a loader that resolves it.
# `node --experimental-strip-types` strips types but keeps Node's ESM resolver, which will
# not resolve the extensionless imports this codebase is written with — the entry point
# dies on `Cannot find module '/repo/apps/api/src/server'`. tsx resolves them, and pinning
# it here keeps the container honest about what it actually needs.
RUN npm install -g tsx@4.23.13

COPY --from=build /repo/packages/ packages/
COPY --from=build /repo/apps/api/ apps/api/

# Cloud Run sets PORT and terminates TLS in front of us.
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["tsx", "apps/api/src/index.ts"]

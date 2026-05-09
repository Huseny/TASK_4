# MergeStream test harness image.
# Provides Node 20 + git so the full test suite (unit, integration, contract,
# client) can run against mongodb-memory-server without a host runtime.
FROM node:20-bookworm-slim

WORKDIR /workspace

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ca-certificates bash \
      python3 make g++ \
      libcurl4 \
 && rm -rf /var/lib/apt/lists/*

# Copy manifests first so npm ci layer is only invalidated when deps change.
COPY package.json package-lock.json /workspace/repo/
COPY app/server/package.json /workspace/repo/app/server/
COPY app/client/package.json /workspace/repo/app/client/

WORKDIR /workspace/repo

# Use BuildKit cache mount for npm cache — survives across builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Pre-download the MongoDB binary so tests don't fetch it at runtime
ENV MONGOMS_VERSION=7.0.14
RUN node -e " \
  const { MongoMemoryServer } = require('mongodb-memory-server'); \
  MongoMemoryServer.create().then(s => s.stop()).catch(e => { console.error(e); process.exit(1); }); \
"

# Now copy the full source (changes here don't bust the npm ci cache)
COPY . /workspace/repo

CMD ["npm", "test"]

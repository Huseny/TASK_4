#!/usr/bin/env bash
# MergeStream automated test harness.
# Runs the full test suite inside the Docker image defined by ./Dockerfile —
# server unit + integration + contract + client unit. mongodb-memory-server
# is bundled, so no external MongoDB or host runtime is required.

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker must be installed and on PATH" >&2
  exit 1
fi

IMAGE_TAG="mergestream-test:local"

docker build -t "$IMAGE_TAG" -f Dockerfile .
docker run --rm "$IMAGE_TAG"

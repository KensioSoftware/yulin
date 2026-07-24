#!/usr/bin/env bash

set -Eeuo pipefail

RELEASE_TYPE="${1:-minor}"

pnpm install
pnpm lint
pnpm test:coverage
pnpm build
# Verifies the real tarball in a throwaway install, not just the local dist/.
pnpm verify:pack
pnpm version "${RELEASE_TYPE}"
pnpm login
pnpm publish --access public
git push
git push --tags

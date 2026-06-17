#!/usr/bin/env bash

set -Eeuo pipefail

pnpm install
pnpm lint
pnpm test:coverage
pnpm build
pnpm pack --dry-run
pnpm version minor
pnpm login
pnpm publish --access public
git push
git push --tags

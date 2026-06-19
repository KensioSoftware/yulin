#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="${ROOT_DIR}/src"

THRESHOLD=50

# Always print the normal FTA table output for humans / CI logs.
fta "${SRC_DIR}"

# Use JSON output only to decide whether the script should fail.
FINDINGS="$(
  fta "${SRC_DIR}" --json |
    jq --argjson threshold "${THRESHOLD}" \
      'map(select(.fta_score >= $threshold))'
)"

FINDING_COUNT="$(jq 'length' <<<"${FINDINGS}")"

if [[ "${FINDING_COUNT}" -gt 0 ]]; then
  echo
  echo "Found ${FINDING_COUNT} file(s) with FTA score >= ${THRESHOLD}."
  exit 1
fi

echo
echo "All ${SRC_DIR}/**/*.ts files are under FTA threshold of ${THRESHOLD}."

#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="${ROOT_DIR}/src"

THRESHOLD=50

# Always print the normal FTA table output for humans / CI logs.
fta "${SRC_DIR}" --config-path "${ROOT_DIR}/fta.json"

# Use JSON output to find files that violate the threshold.
FINDINGS="$(
  fta "${SRC_DIR}" --config-path "${ROOT_DIR}/fta.json" --json |
    jq --argjson threshold "${THRESHOLD}" '
      map(select(.fta_score >= $threshold))
      | sort_by(.fta_score)
      | reverse
    '
)"

FINDING_COUNT="$(jq 'length' <<<"${FINDINGS}")"

if [[ "${FINDING_COUNT}" -gt 0 ]]; then
  echo
  echo "Found ${FINDING_COUNT} file(s) with FTA score >= ${THRESHOLD}."
  echo
  echo "FTA findings:"
  jq '.' <<<"${FINDINGS}"
  exit 1
fi

echo
echo "All ${SRC_DIR}/**/*.ts files are under FTA threshold of ${THRESHOLD}."

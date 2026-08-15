#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="${ROOT_DIR}/src"

THRESHOLD=50

# fta.json sets score_cap as a failsafe for anyone running fta directly, but it
# is too blunt to use here: it aborts on the first breaching file and writes
# nothing to stdout, which would suppress both the table below and the --json
# payload the gate depends on. Override it back to the fta default so this
# script keeps reporting every breach, not just the first one fta happens to
# reach. The jq gate below is the stricter of the two anyway (>= vs >).
#
# Always print the normal FTA table output for humans / CI logs.
fta "${SRC_DIR}" --config-path "${ROOT_DIR}/fta.json" --score-cap 1000

# Use JSON output to find files that violate the threshold.
FINDINGS="$(
  fta "${SRC_DIR}" --config-path "${ROOT_DIR}/fta.json" --score-cap 1000 --json |
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

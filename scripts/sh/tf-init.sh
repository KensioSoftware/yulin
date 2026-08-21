#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# One provider copy shared by every configuration. Terraform's default is a
# copy per directory, and the AWS provider is about 650MB of binary each time.
export TF_PLUGIN_CACHE_DIR="${TF_PLUGIN_CACHE_DIR:-${HOME}/.terraform.d/plugin-cache}"
mkdir -p "${TF_PLUGIN_CACHE_DIR}"

for CONFIG in "${ROOT_DIR}"/test/terraform/*/; do
  echo "==> terraform init $(basename "${CONFIG}")"
  terraform -chdir="${CONFIG}" init -input=false -no-color
done

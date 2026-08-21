/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  blocks,
  field,
  properties,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";

/** The default encryption a bucket applies, as CloudFormation declares it. */
export function encryption(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  return {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: blocks(context, "rule").map((rule) =>
        encryptionRule(rule),
      ),
    },
  };
}

function encryptionRule(rule: Record<string, unknown>): SimCfnTemplateValue {
  const configured = field(rule, "apply_server_side_encryption_by_default");
  const applied: unknown = Array.isArray(configured)
    ? (configured as unknown[])[0]
    : undefined;

  if (!isRecord(applied)) {
    return {};
  }

  return {
    ServerSideEncryptionByDefault: properties({
      SSEAlgorithm: field(applied, "sse_algorithm") as string,
      KMSMasterKeyID: field(applied, "kms_master_key_id") as string,
    }),
  };
}

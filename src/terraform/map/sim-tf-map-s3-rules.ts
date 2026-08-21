/*
 * The two bucket sections that are lists of rules rather than flat settings.
 *
 * Versioning and the public access block are renames. CORS and default
 * encryption arrive as repeating Terraform blocks and CloudFormation holds
 * each as a list of rules under a wrapper of its own, so both are rebuilt
 * rather than carried across.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  blocks,
  field,
  properties,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";

/** The CORS rules a bucket answers browser requests under. */
export function cors(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  const rules = blocks(context, "cors_rule").map((rule) =>
    properties({
      AllowedHeaders: field(rule, "allowed_headers") as string[],
      AllowedMethods: field(rule, "allowed_methods") as string[],
      AllowedOrigins: field(rule, "allowed_origins") as string[],
      MaxAge: field(rule, "max_age_seconds") as number,
    }),
  );

  return { CorsConfiguration: { CorsRules: rules } };
}

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

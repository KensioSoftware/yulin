/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  blocks,
  field,
  properties,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";

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

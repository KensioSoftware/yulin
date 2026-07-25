import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { isCfnTemplateValueRecord } from "../../../cloudformation/resource/template/sim-cfn-templ-value-record.js";

export type SimCfnCffRuntime = "cloudfront-js-1.0" | "cloudfront-js-2.0";

/**
 * Minimal FunctionConfig shape passed to the simulated CloudFront service.
 *
 * The simulator only preserves recognized scalar values. Missing or unsupported
 * optional fields are omitted rather than coerced.
 */
export interface SimCfnCffFunctionConfig {
  readonly Comment?: string | undefined;
  readonly Runtime?: SimCfnCffRuntime | undefined;
}

const simCfnCffRuntimes = new Set<SimCfnCffRuntime>([
  "cloudfront-js-1.0",
  "cloudfront-js-2.0",
]);

/**
 * Parse the optional AWS::CloudFront::Function FunctionConfig property.
 *
 * FunctionConfig itself must be an object when present. Individual optional
 * properties are permissive: Comment is kept only when it is a string, and
 * Runtime is kept only when it is one of the supported CloudFront Function
 * runtime literals.
 */
export function simCfnCffFunctionConfig(
  functionConfigValue: SimCfnTemplateValue | undefined,
): SimCfnCffFunctionConfig | undefined {
  if (functionConfigValue === undefined || functionConfigValue === null) {
    return undefined;
  }

  if (!isCfnTemplateValueRecord(functionConfigValue)) {
    throw new TypeError(
      "AWS::CloudFront::Function FunctionConfig must be an object",
    );
  }

  const commentValue = functionConfigValue["Comment"];
  const runtimeValue = functionConfigValue["Runtime"];

  return {
    Comment: typeof commentValue === "string" ? commentValue : undefined,
    Runtime: cffRuntime(runtimeValue),
  };
}

/**
 * Return a supported CloudFront Function runtime literal, or undefined when the
 * template value is missing, non-string, or not one of the supported runtimes.
 */
function cffRuntime(
  value: SimCfnTemplateValue | undefined,
): SimCfnCffRuntime | undefined {
  return typeof value === "string" &&
    simCfnCffRuntimes.has(value as SimCfnCffRuntime)
    ? (value as SimCfnCffRuntime)
    : undefined;
}

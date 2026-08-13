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
  readonly KeyValueStoreAssociations?:
    | {
        readonly Quantity: number;
        readonly Items: readonly { readonly KeyValueStoreARN: string }[];
      }
    | undefined;
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
  const associations = cffKeyValueStoreAssociations(
    functionConfigValue["KeyValueStoreAssociations"],
  );

  return {
    Comment: typeof commentValue === "string" ? commentValue : undefined,
    Runtime: cffRuntime(runtimeValue),
    ...(associations !== undefined && {
      KeyValueStoreAssociations: associations,
    }),
  };
}

/**
 * Read the template's key value store associations into the command's shape.
 *
 * CloudFormation takes a plain array here, while the CreateFunction API takes
 * the Quantity and Items pair every other CloudFront list uses. The template is
 * the shape being read, so the translation happens here rather than the command
 * learning a second shape.
 *
 * An entry with no `KeyValueStoreARN` is dropped rather than refused. The
 * command refuses an association it cannot resolve, and refusing it here would
 * report the same mistake in worse terms.
 */
function cffKeyValueStoreAssociations(
  value: SimCfnTemplateValue | undefined,
): SimCfnCffFunctionConfig["KeyValueStoreAssociations"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((entry) => isCfnTemplateValueRecord(entry))
    .map((entry) => entry["KeyValueStoreARN"])
    .filter((arn) => typeof arn === "string")
    .map((KeyValueStoreARN) => ({ KeyValueStoreARN }));

  return { Quantity: items.length, Items: items };
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

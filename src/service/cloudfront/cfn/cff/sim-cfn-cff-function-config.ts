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
 * An entry that cannot be read is refused rather than dropped. Dropping one
 * leaves the command nothing to refuse: a Function whose only association was
 * misspelled would deploy with no store at all and fail at request time on
 * `cf.kvs()`, a long way from the template line that was wrong.
 */
function cffKeyValueStoreAssociations(
  value: SimCfnTemplateValue | undefined,
): SimCfnCffFunctionConfig["KeyValueStoreAssociations"] {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new TypeError(
      "AWS::CloudFront::Function FunctionConfig KeyValueStoreAssociations " +
        "must be an array",
    );
  }

  const items = value.map((entry, index) =>
    keyValueStoreAssociation(entry, index),
  );

  return { Quantity: items.length, Items: items };
}

/**
 * One association from the template array, refusing one that cannot be read.
 */
function keyValueStoreAssociation(
  entry: SimCfnTemplateValue,
  index: number,
): { readonly KeyValueStoreARN: string } {
  const at = `KeyValueStoreAssociations[${String(index)}]`;

  if (!isCfnTemplateValueRecord(entry)) {
    throw new TypeError(
      `AWS::CloudFront::Function FunctionConfig ${at} must be an object`,
    );
  }

  const arn = entry["KeyValueStoreARN"];

  if (typeof arn !== "string") {
    throw new TypeError(
      `AWS::CloudFront::Function FunctionConfig ${at} KeyValueStoreARN must ` +
        `be a string`,
    );
  }

  return { KeyValueStoreARN: arn };
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

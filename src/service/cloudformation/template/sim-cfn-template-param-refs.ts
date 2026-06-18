import type { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import { isRecord } from "../../../util/type-guard/record.js";

/**
 * Resolve CloudFormation Parameter Ref expressions in a template value.
 */
export function resolveSimCfnTemplateParamRefs(
  value: Record<string, unknown>,
  parameters: SimCfnParameters,
): Record<string, unknown>;
export function resolveSimCfnTemplateParamRefs(
  value: unknown,
  parameters: SimCfnParameters,
): unknown;
export function resolveSimCfnTemplateParamRefs(
  value: unknown,
  parameters: SimCfnParameters,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveSimCfnTemplateParamRefs(item, parameters),
    );
  }

  if (!isRecord(value)) {
    return value;
  }

  const ref = value["Ref"];

  if (
    Object.keys(value).length === 1 &&
    typeof ref === "string" &&
    parameters.has(ref)
  ) {
    return parameters.value(ref);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      resolveSimCfnTemplateParamRefs(entryValue, parameters),
    ]),
  );
}

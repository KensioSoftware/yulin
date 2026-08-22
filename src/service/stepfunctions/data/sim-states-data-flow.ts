import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesPathMatchFailure } from "../error/sim-step-functions.error.js";
import { selectSimStatesReadPath } from "./sim-states-context-path.js";
import { evaluateSimStatesPayloadTemplate } from "./sim-states-payload-template.js";
import { parseSimStatesReferencePath } from "./sim-states-reference-path.js";
import { insertAtSimStatesPath } from "./sim-states-result-path.js";

/**
 * The data-flow fields one state carries.
 *
 * A field left out and a field written as `null` mean different things in
 * Amazon States Language, so absent is `undefined` here and `null` is the JSON
 * null the definition wrote.
 */
export interface SimStatesDataFlowFields {
  readonly InputPath?: string | null;
  readonly Parameters?: JSONValue;
  readonly ResultSelector?: JSONValue;
  readonly ResultPath?: string | null;
  readonly OutputPath?: string | null;
}

/**
 * The input a state's work receives.
 *
 * `InputPath` narrows the raw input and `Parameters` then builds a value from
 * what is left, which is the order Amazon States Language applies them in.
 * Both read the context object where the caller has one.
 */
export function simStatesEffectiveInput(
  rawInput: JSONValue,
  fields: SimStatesDataFlowFields,
  context: JSONValue = null,
): JSONValue {
  const narrowed = applyPath(rawInput, fields.InputPath, "InputPath", context);

  return fields.Parameters === undefined
    ? narrowed
    : evaluateSimStatesPayloadTemplate(fields.Parameters, narrowed, context);
}

/**
 * The output a state passes to the next one.
 *
 * `ResultSelector` reshapes the result, `ResultPath` puts it back into the raw
 * input, and `OutputPath` narrows what comes out. `ResultPath` reads the raw
 * input rather than the effective one, so a state can keep fields `InputPath`
 * had already taken away.
 */
export function simStatesEffectiveOutput(
  rawInput: JSONValue,
  result: JSONValue,
  fields: SimStatesDataFlowFields,
  context: JSONValue = null,
): JSONValue {
  const selected =
    fields.ResultSelector === undefined
      ? result
      : evaluateSimStatesPayloadTemplate(
          fields.ResultSelector,
          result,
          context,
        );

  return applyPath(
    applyResultPath(rawInput, selected, fields.ResultPath),
    fields.OutputPath,
    "OutputPath",
    context,
  );
}

/**
 * Combine a result with the raw input, as `ResultPath` asks.
 */
function applyResultPath(
  rawInput: JSONValue,
  result: JSONValue,
  resultPath: string | null | undefined,
): JSONValue {
  if (resultPath === null) {
    return rawInput;
  }

  if (resultPath === undefined) {
    return result;
  }

  return insertAtSimStatesPath(
    rawInput,
    parseSimStatesReferencePath(resultPath),
    result,
    resultPath,
  );
}

/**
 * Narrow a value by `InputPath` or `OutputPath`.
 *
 * Both read the same way. A path written as `null` answers with an empty
 * object, an absent one passes the value through, and a path selecting nothing
 * fails the state.
 */
function applyPath(
  value: JSONValue,
  path: string | null | undefined,
  field: string,
  context: JSONValue,
): JSONValue {
  if (path === null) {
    return {};
  }

  if (path === undefined) {
    return value;
  }

  const selected = selectSimStatesReadPath(path, value, context);

  if (selected === undefined) {
    throw new SimStatesPathMatchFailure(
      `${field} reads ${path}, which selects nothing in the value the state ` +
        "was given.",
    );
  }

  return selected;
}

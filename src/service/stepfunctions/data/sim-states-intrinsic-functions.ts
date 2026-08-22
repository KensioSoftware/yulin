// oxlint-disable security/detect-object-injection -- the index counts
// placeholders in a template this function is reading.
import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesIntrinsicFailure } from "../error/sim-step-functions.error.js";

/**
 * What one intrinsic does with its resolved arguments.
 */
export type SimStatesIntrinsicFunction = (
  values: readonly JSONValue[],
  expression: string,
) => JSONValue;

/**
 * The intrinsic functions this simulator answers.
 *
 * `States.UUID` and `States.MathRandom` are absent on purpose. Both answer
 * differently on every call, and a test asserting on the output of a state
 * machine that used one could only assert on its shape.
 */
export const simStatesIntrinsics = new Map<string, SimStatesIntrinsicFunction>([
  ["States.Format", formatIntrinsic],
  ["States.Array", (values): JSONValue => [...values]],
  ["States.ArrayLength", arrayLengthIntrinsic],
  ["States.StringToJson", stringToJsonIntrinsic],
  ["States.JsonToString", jsonToStringIntrinsic],
]);

/**
 * `States.Format`, which fills each {} placeholder from the arguments in order.
 */
function formatIntrinsic(
  values: readonly JSONValue[],
  expression: string,
): JSONValue {
  const [template, ...fillers] = values;

  if (typeof template !== "string") {
    throw new SimStatesIntrinsicFailure(
      `${expression} needs a string as its first argument.`,
    );
  }

  let index = 0;
  const formatted = template.replaceAll(/\\[{}]|\{}/g, (token) => {
    if (token.startsWith("\\")) {
      return token.slice(1);
    }

    const filler = fillers[index];
    index++;

    return typeof filler === "string" ? filler : JSON.stringify(filler);
  });

  if (index !== fillers.length) {
    throw new SimStatesIntrinsicFailure(
      `${expression} has ${String(fillers.length)} values for ` +
        `${String(index)} placeholders.`,
    );
  }

  return formatted;
}

/**
 * Take the one value a single-argument intrinsic was called with.
 */
function onlyArgument(
  values: readonly JSONValue[],
  expression: string,
): JSONValue {
  if (values.length !== 1) {
    throw new SimStatesIntrinsicFailure(
      `${expression} takes one argument and was given ` +
        `${String(values.length)}.`,
    );
  }

  return values[0] as JSONValue;
}

/**
 * `States.ArrayLength`.
 */
function arrayLengthIntrinsic(
  values: readonly JSONValue[],
  expression: string,
): JSONValue {
  const array = onlyArgument(values, expression);

  if (!Array.isArray(array)) {
    throw new SimStatesIntrinsicFailure(
      `${expression} needs an array as its argument.`,
    );
  }

  return array.length;
}

/**
 * `States.StringToJson`.
 */
function stringToJsonIntrinsic(
  values: readonly JSONValue[],
  expression: string,
): JSONValue {
  const text = onlyArgument(values, expression);

  if (typeof text !== "string") {
    throw new SimStatesIntrinsicFailure(
      `${expression} needs a string as its argument.`,
    );
  }

  try {
    return JSON.parse(text) as JSONValue;
  } catch {
    throw new SimStatesIntrinsicFailure(
      `${expression} was given a string that is not JSON.`,
    );
  }
}

/**
 * `States.JsonToString`.
 */
function jsonToStringIntrinsic(
  values: readonly JSONValue[],
  expression: string,
): JSONValue {
  return JSON.stringify(onlyArgument(values, expression));
}

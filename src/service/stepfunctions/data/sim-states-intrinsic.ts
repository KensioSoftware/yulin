import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesIntrinsicFailure } from "../error/sim-step-functions.error.js";
import type { SimStatesIntrinsicArgument } from "./sim-states-intrinsic-argument.js";
import { simStatesIntrinsics } from "./sim-states-intrinsic-functions.js";
import { parseSimStatesIntrinsic } from "./sim-states-intrinsic-parse.js";
import { selectSimStatesPath } from "./sim-states-path-segment.js";
import { parseSimStatesReferencePath } from "./sim-states-reference-path.js";

/**
 * The names this simulator answers, for a message listing them.
 */
export const simStatesIntrinsicNames: readonly string[] = simStatesIntrinsics
  .keys()
  .toArray();

/**
 * Run an intrinsic function against the document its paths read from.
 */
export function evaluateSimStatesIntrinsic(
  expression: string,
  document: JSONValue,
): JSONValue {
  const call = parseSimStatesIntrinsic(expression);
  const intrinsic = simStatesIntrinsics.get(call.name);

  if (intrinsic === undefined) {
    throw new SimStatesIntrinsicFailure(
      `${call.name} is not an intrinsic function this simulator answers. It ` +
        `answers ${simStatesIntrinsicNames.join(", ")}.`,
    );
  }

  return intrinsic(
    call.arguments.map((argument) =>
      resolveArgument(argument, document, expression),
    ),
    expression,
  );
}

/**
 * Reduce one argument to the value the intrinsic receives.
 */
function resolveArgument(
  argument: SimStatesIntrinsicArgument,
  document: JSONValue,
  expression: string,
): JSONValue {
  if (argument.kind === "literal") {
    return argument.value;
  }

  if (argument.kind === "call") {
    return evaluateSimStatesIntrinsic(argument.expression, document);
  }

  const selected = selectSimStatesPath(
    document,
    parseSimStatesReferencePath(argument.path),
  );

  if (selected === undefined) {
    throw new SimStatesIntrinsicFailure(
      `${expression} reads ${argument.path}, which selects nothing in the ` +
        "value it was given.",
    );
  }

  return selected;
}

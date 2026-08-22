import { SimStatesIntrinsicFailure } from "../error/sim-step-functions.error.js";
import {
  type SimStatesIntrinsicArgument,
  parseSimStatesIntrinsicArgument,
} from "./sim-states-intrinsic-argument.js";

/**
 * A parsed intrinsic function invocation.
 */
export interface SimStatesIntrinsicCall {
  readonly name: string;
  readonly arguments: readonly SimStatesIntrinsicArgument[];
}

const bracketDepths = new Map([
  ["(", 1],
  [")", -1],
]);

/**
 * Parse an intrinsic invocation into its name and arguments.
 */
export function parseSimStatesIntrinsic(
  expression: string,
): SimStatesIntrinsicCall {
  const trimmed = expression.trim();
  const open = trimmed.indexOf("(");

  if (open === -1 || !trimmed.endsWith(")")) {
    throw new SimStatesIntrinsicFailure(
      `${expression} is not an intrinsic function call. One is written as ` +
        "States.Name(arguments).",
    );
  }

  return {
    name: trimmed.slice(0, open),
    arguments: splitArguments(expression, trimmed.slice(open + 1, -1)).map(
      (argument) => parseSimStatesIntrinsicArgument(expression, argument),
    ),
  };
}

/**
 * Split an argument list on the commas that separate arguments.
 *
 * A comma inside a quoted string or inside a nested call belongs to that
 * argument, so depth and quoting are both tracked while scanning.
 */
function splitArguments(expression: string, inner: string): readonly string[] {
  if (inner.trim() === "") {
    return [];
  }

  const argumentTexts: string[] = [];
  let current = "";
  let depth = 0;
  let quoted = false;

  for (let index = 0; index < inner.length; index++) {
    const character = inner.charAt(index);

    if (quoted) {
      current += character;

      if (character === "\\") {
        current += inner.charAt(index + 1);
        index++;
      } else if (character === "'") {
        quoted = false;
      }

      continue;
    }

    if (character === "," && depth === 0) {
      argumentTexts.push(current);
      current = "";
      continue;
    }

    if (character === "'") {
      quoted = true;
    } else {
      depth += bracketDepths.get(character) ?? 0;
    }

    current += character;
  }

  if (quoted || depth !== 0) {
    throw new SimStatesIntrinsicFailure(
      `${expression} has an unclosed quote or bracket in its arguments.`,
    );
  }

  argumentTexts.push(current);

  return argumentTexts;
}

// oxlint-disable security/detect-object-injection -- indexes walk the
// expression string this function is parsing.
import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesIntrinsicFailure } from "../error/sim-step-functions.error.js";

/**
 * One argument to an intrinsic function.
 *
 * A nested call is held as the text it was written as. It is parsed when the
 * outer call runs, which keeps parsing and evaluation from having to know
 * about each other.
 */
export type SimStatesIntrinsicArgument =
  | { readonly kind: "literal"; readonly value: JSONValue }
  | { readonly kind: "path"; readonly path: string }
  | { readonly kind: "call"; readonly expression: string };

// oxlint-disable-next-line security/detect-unsafe-regex -- no nested quantifier.
const numberPattern = /^-?\d+(?:\.\d+)?$/;

/**
 * Whether a Payload Template value is an intrinsic invocation.
 *
 * Amazon States Language gives a `.$` field two possible values, a Reference
 * Path or an intrinsic, and tells them apart by this prefix.
 */
export function isSimStatesIntrinsic(value: string): boolean {
  return value.startsWith("States.");
}

/**
 * Read one argument, which is a literal, a Reference Path or a nested call.
 */
export function parseSimStatesIntrinsicArgument(
  expression: string,
  argument: string,
): SimStatesIntrinsicArgument {
  const trimmed = argument.trim();

  if (trimmed.startsWith("'")) {
    return { kind: "literal", value: parseStringLiteral(expression, trimmed) };
  }

  if (isSimStatesIntrinsic(trimmed)) {
    return { kind: "call", expression: trimmed };
  }

  if (trimmed.startsWith("$")) {
    return { kind: "path", path: trimmed };
  }

  return { kind: "literal", value: parseBareLiteral(expression, trimmed) };
}

/**
 * Read a single quoted string, resolving its escapes.
 *
 * An escaped brace is left as it was written. Braces mean something to
 * `States.Format` and nothing to the quoting, so resolving `\{` here would take
 * away the only thing telling a literal brace apart from a placeholder.
 * `States.Format` resolves them, and a brace escape reaching another intrinsic
 * arrives with its backslash. The docs record that divergence.
 */
function parseStringLiteral(expression: string, argument: string): string {
  if (!argument.endsWith("'")) {
    throw new SimStatesIntrinsicFailure(
      `${expression} has an unterminated string argument.`,
    );
  }

  const body = argument.slice(1, -1);
  let read = "";

  for (let index = 0; index < body.length; index++) {
    const character = body.charAt(index);

    if (character === "\\") {
      const escaped = body.charAt(index + 1);

      read += escaped === "{" || escaped === "}" ? `\\${escaped}` : escaped;
      index++;
      continue;
    }

    read += character;
  }

  return read;
}

/**
 * Read an unquoted argument, which is a number, a boolean or null.
 */
function parseBareLiteral(expression: string, argument: string): JSONValue {
  if (argument === "true") {
    return true;
  }

  if (argument === "false") {
    return false;
  }

  if (argument === "null") {
    return null;
  }

  if (numberPattern.test(argument)) {
    return Number(argument);
  }

  throw new SimStatesIntrinsicFailure(
    `${expression} has an argument this simulator cannot read (${argument}). ` +
      "An argument is a quoted string, a number, a boolean, null, a " +
      "Reference Path or another intrinsic.",
  );
}

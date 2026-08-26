import {
  simGlueExpressionAtPosition,
  simGlueExpressionError,
} from "./sim-glue-expression-error.js";
import type { SimGlueExpressionTokenRead } from "./sim-glue-expression-token-reader.js";

/**
 * Read a string literal.
 *
 * A doubled quote inside one is an escaped quote, which is how both Glue and
 * ANSI SQL write it.
 */
export function simGlueReadExpressionString(
  expression: string,
  position: number,
): SimGlueExpressionTokenRead {
  let cursor = position + 1;
  let text = "";

  while (cursor < expression.length) {
    const character = expression.charAt(cursor);

    if (character !== "'") {
      text += character;
      cursor += 1;
      continue;
    }

    if (expression.charAt(cursor + 1) === "'") {
      text += "'";
      cursor += 2;
      continue;
    }

    return { token: { kind: "string", text, position }, next: cursor + 1 };
  }

  throw simGlueExpressionError(
    "a string literal was opened and never closed",
    simGlueExpressionAtPosition(position),
  );
}

/**
 * Whether a number starts here.
 *
 * A minus sign begins one when a digit follows it. This grammar has no
 * arithmetic, so a minus anywhere else is a character it cannot read.
 */
export function simGlueExpressionStartsNumber(
  expression: string,
  position: number,
): boolean {
  const character = expression.charAt(position);

  if (isDigit(expression, position)) {
    return true;
  }

  return character === "-" && isDigit(expression, position + 1);
}

/**
 * Read a number literal, which may be negative and may have a fraction.
 *
 * A dot is part of the number only where a digit follows it, so `1.` reads as
 * the number 1 and then a character this grammar refuses.
 */
export function simGlueReadExpressionNumber(
  expression: string,
  position: number,
): SimGlueExpressionTokenRead {
  const signed = expression.charAt(position) === "-" ? position + 1 : position;
  let cursor = digitsEnd(expression, signed);

  if (expression.charAt(cursor) === "." && isDigit(expression, cursor + 1)) {
    cursor = digitsEnd(expression, cursor + 1);
  }

  return {
    token: {
      kind: "number",
      text: expression.slice(position, cursor),
      position,
    },
    next: cursor,
  };
}

/** Where the run of digits starting here ends. */
function digitsEnd(expression: string, from: number): number {
  let cursor = from;

  while (isDigit(expression, cursor)) {
    cursor += 1;
  }

  return cursor;
}

/** Whether the character here is a digit. */
function isDigit(expression: string, position: number): boolean {
  return /[0-9]/.test(expression.charAt(position));
}

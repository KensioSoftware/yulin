import {
  simGlueExpressionAtPosition,
  simGlueExpressionError,
} from "./sim-glue-expression-error.js";
import type { SimGlueExpressionTokenRead } from "./sim-glue-expression-token-reader.js";

/** The two-character operators, read before the one-character ones. */
const longSymbols = ["<>", "!=", "<=", ">="];

/** The one-character symbols this grammar uses. */
const shortSymbols = new Set(["=", "<", ">", "(", ")", ","]);

/**
 * Read a comparison operator, a bracket or a comma.
 *
 * `<=` is read before `<`, since reading the shorter one first would leave an
 * `=` behind and refuse the expression for holding one too many.
 */
export function simGlueReadExpressionSymbol(
  expression: string,
  position: number,
): SimGlueExpressionTokenRead {
  const long = longSymbols.find((symbol) =>
    expression.startsWith(symbol, position),
  );

  if (long !== undefined) {
    return {
      token: { kind: "symbol", text: long, position },
      next: position + long.length,
    };
  }

  const character = expression.charAt(position);

  if (shortSymbols.has(character)) {
    return {
      token: { kind: "symbol", text: character, position },
      next: position + 1,
    };
  }

  throw simGlueExpressionError(
    `'${character}' is not something an expression can hold`,
    simGlueExpressionAtPosition(position),
  );
}

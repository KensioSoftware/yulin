import {
  simGlueExpressionStartsNumber,
  simGlueReadExpressionNumber,
  simGlueReadExpressionString,
} from "./sim-glue-expression-literal-reader.js";
import { simGlueReadExpressionSymbol } from "./sim-glue-expression-symbol-reader.js";
import type { SimGlueExpressionToken } from "./sim-glue-expression-token.js";

/** Characters an unquoted column name or a keyword is made of. */
const nameCharacter = /[A-Za-z0-9_]/;

/** One token, with where reading carries on from. */
export interface SimGlueExpressionTokenRead {
  readonly token: SimGlueExpressionToken;
  readonly next: number;
}

/**
 * Read the one token starting here.
 */
export function simGlueReadExpressionToken(
  expression: string,
  position: number,
): SimGlueExpressionTokenRead {
  const character = expression.charAt(position);

  if (character === "'") {
    return simGlueReadExpressionString(expression, position);
  }

  if (simGlueExpressionStartsNumber(expression, position)) {
    return simGlueReadExpressionNumber(expression, position);
  }

  if (nameCharacter.test(character)) {
    return readName(expression, position);
  }

  return simGlueReadExpressionSymbol(expression, position);
}

/** Read a column name or a keyword, keeping the case it was written in. */
function readName(
  expression: string,
  position: number,
): SimGlueExpressionTokenRead {
  let cursor = position;

  while (
    cursor < expression.length &&
    nameCharacter.test(expression.charAt(cursor))
  ) {
    cursor += 1;
  }

  return {
    token: { kind: "name", text: expression.slice(position, cursor), position },
    next: cursor,
  };
}

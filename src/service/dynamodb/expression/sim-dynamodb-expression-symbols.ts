/**
 * The two character operators, which are read before the single characters so
 * `<=` is one operator rather than a `<` followed by an `=`.
 */
const longSymbols: readonly string[] = ["<=", ">=", "<>"];

/**
 * The single characters that mean something in the expressions supported so
 * far.
 *
 * This set grows as filter and update expressions arrive. Until then, a
 * character outside it is refused rather than passed through, so an expression
 * this simulation cannot evaluate fails rather than half works.
 */
const symbols: ReadonlySet<string> = new Set([
  ".",
  ",",
  "[",
  "]",
  "-",
  "(",
  ")",
  "=",
  "<",
  ">",
]);

/**
 * The symbol an expression starts with, or nothing when it starts with a
 * character no supported expression uses.
 */
export function readSimDynamoDbSymbol(remaining: string): string | undefined {
  const operator = longSymbols.find((text) => remaining.startsWith(text));

  if (operator !== undefined) {
    return operator;
  }

  const character = remaining.slice(0, 1);

  if (!symbols.has(character)) {
    return undefined;
  }

  return character;
}

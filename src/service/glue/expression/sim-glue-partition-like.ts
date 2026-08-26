import type { SimGluePartitionColumn } from "./sim-glue-partition-columns.js";
import type { SimGluePartitionFilter } from "./sim-glue-partition-filter.js";
import type { SimGluePartitionLiteral } from "./sim-glue-partition-literal.js";
import { simGlueColumnValue } from "./sim-glue-partition-order.js";

/**
 * The pattern characters, and the ones a regular expression would read as
 * something other than themselves.
 */
const likeOrSpecial = /[%_]|[.*+?^${}()|[\]\\]/g;

/**
 * A filter holding where a key matches a SQL `LIKE` pattern.
 *
 * `%` stands for any run of characters and `_` for exactly one, which is what
 * they mean in SQL. Everything else in the pattern matches itself.
 *
 * The pattern is matched against the value as it was stored, whatever type the
 * key is declared with. `LIKE` is a test on text, and a numeric key compared
 * this way is compared as the text it was registered as.
 */
export function simGlueLikeFilter(
  column: SimGluePartitionColumn,
  pattern: SimGluePartitionLiteral,
): SimGluePartitionFilter {
  const matcher = simGlueLikePattern(pattern.text);

  return (values): boolean => matcher.test(simGlueColumnValue(column, values));
}

/**
 * Turn a `LIKE` pattern into the expression that matches it.
 *
 * A run of `%` collapses to one. `%%%` asks the same thing as `%`, and the
 * expression it would otherwise build backtracks over every way of splitting
 * the value between them.
 */
export function simGlueLikePattern(pattern: string): RegExp {
  const source = pattern
    .replaceAll(likeOrSpecial, (match) => simGlueLikeCharacter(match))
    .replaceAll(/(?:\.\*)+/g, ".*");

  // The pattern comes from the caller's expression, and this is what LIKE is.
  // Every character that is not a wildcard has been escaped to match itself.
  // oxlint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(`^${source}$`, "s");
}

/** What one pattern or special character becomes. */
function simGlueLikeCharacter(character: string): string {
  if (character === "%") {
    return ".*";
  }

  return character === "_" ? "." : `\\${character}`;
}

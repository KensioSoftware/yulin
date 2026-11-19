import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";

/** Where a statement starts, before its first `SELECT`. */
const leadingBlock = 0;

/** The words a subquery's bracket follows when it stands in for a table. */
const tableClauses = new Set(["from", "join"]);

/**
 * Which `SELECT` each token of a statement belongs to.
 *
 * Every `SELECT` starts a block, and the block runs until the next `SELECT`
 * at the same bracket depth or the bracket closing around it. A bracket
 * holding no `SELECT` (a condition, a list, a function's arguments) stays in
 * the block around it. So the two halves of a `UNION` are two blocks, and so
 * is a subquery and the query around it.
 *
 * A subquery standing in for a table, as in `FROM (SELECT ...)`, records the
 * block around it as its outer block, for every `SELECT` in its brackets. That
 * query's `WHERE` filters the rows the subquery produces, and Athena pushes the
 * filter down into the read.
 */
export interface SimAthenaQueryBlocks {
  /** The block each token sits in, by token position. */
  readonly blockOf: readonly number[];

  /** The block around each subquery in a `FROM` or a `JOIN`. */
  readonly outerOf: ReadonlyMap<number, number>;
}

/** Read the blocks of one statement, from left to right. */
export function simAthenaQueryBlocks(
  tokens: readonly SimAthenaSqlToken[],
): SimAthenaQueryBlocks {
  const open: SimAthenaBracketFrame[] = [{ block: leadingBlock }];
  const blockOf: number[] = [];
  const outerOf = new Map<number, number>();
  let blocks = leadingBlock;

  for (const [position, token] of tokens.entries()) {
    const frame = open.at(-1) ?? { block: leadingBlock };

    if (token.kind === "symbol" && token.text === "(") {
      open.push({
        block: frame.block,
        outer: followsTableClause(tokens, position) ? frame.block : undefined,
      });
    } else if (token.kind === "symbol" && token.text === ")") {
      open.length = Math.max(1, open.length - 1);
    } else if (token.kind === "word" && token.text === "select") {
      blocks += 1;
      frame.block = blocks;

      if (frame.outer !== undefined) {
        outerOf.set(blocks, frame.outer);
      }
    }

    blockOf.push(open.at(-1)?.block ?? leadingBlock);
  }

  return { blockOf, outerOf };
}

/** One open bracket, and the block around it where it holds a table. */
interface SimAthenaBracketFrame {
  block: number;
  readonly outer?: number | undefined;
}

/**
 * Whether the bracket at this position follows `FROM` or `JOIN`.
 *
 * The `FROM` of `IS DISTINCT FROM` is part of a comparison, and a subquery
 * after it is a value.
 */
function followsTableClause(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): boolean {
  const before = tokens.at(position - 1);

  if (position < 1 || before?.kind !== "word") {
    return false;
  }

  const comparison =
    before.text === "from" && tokens.at(position - 2)?.text === "distinct";

  return tableClauses.has(before.text) && !comparison;
}

import { simAthenaAliasAt } from "./sim-athena-read-alias.js";
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
 * filter down into the read. Where the subquery takes an alias, as in
 * `FROM (SELECT ...) s`, every `SELECT` in its brackets records it, and a
 * filter on `s.day` reaches the reads inside it.
 */
export interface SimAthenaQueryBlocks {
  /** The block each token sits in, by token position. */
  readonly blockOf: readonly number[];

  /** The block around each subquery in a `FROM` or a `JOIN`. */
  readonly outerOf: ReadonlyMap<number, number>;

  /** The alias of each subquery in a `FROM` or a `JOIN`, where it has one. */
  readonly aliasOf: ReadonlyMap<number, string>;
}

/** Read the blocks of one statement, from left to right. */
export function simAthenaQueryBlocks(
  tokens: readonly SimAthenaSqlToken[],
): SimAthenaQueryBlocks {
  const open: SimAthenaBracketFrame[] = [{ block: leadingBlock, started: [] }];
  const blockOf: number[] = [];
  const outerOf = new Map<number, number>();
  const aliasOf = new Map<number, string>();
  let blocks = leadingBlock;

  for (const [position, token] of tokens.entries()) {
    const frame = open.at(-1) ?? { block: leadingBlock, started: [] };

    if (token.kind === "symbol" && token.text === "(") {
      open.push({
        block: frame.block,
        outer: followsTableClause(tokens, position) ? frame.block : undefined,
        started: [],
      });
    } else if (token.kind === "symbol" && token.text === ")") {
      const alias = simAthenaAliasAt(tokens, position + 1);

      if (alias !== undefined) {
        for (const block of frame.started) {
          aliasOf.set(block, alias);
        }
      }

      open.length = Math.max(1, open.length - 1);
    } else if (token.kind === "word" && token.text === "select") {
      blocks += 1;
      frame.block = blocks;

      if (frame.outer !== undefined) {
        outerOf.set(blocks, frame.outer);
        frame.started.push(blocks);
      }
    }

    blockOf.push(open.at(-1)?.block ?? leadingBlock);
  }

  return { blockOf, outerOf, aliasOf };
}

/** One open bracket, and the block around it where it holds a table. */
interface SimAthenaBracketFrame {
  block: number;
  readonly outer?: number | undefined;

  /** The blocks started directly in a bracket holding a table. */
  readonly started: number[];
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

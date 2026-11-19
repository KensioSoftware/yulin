import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";

/** Where the statement itself sits, outside every bracket. */
const statementLevel = -1;

/**
 * The positions of every token an `OR` could make optional.
 *
 * `AND` binds tighter than `OR`, so an `OR` splits the whole bracketed group
 * it sits in, and a term anywhere in that group holds on one arm at most. The
 * group is the innermost pair of brackets around the `OR`, or the `SELECT` it
 * sits in where no bracket inside that `SELECT` encloses it. Every token inside
 * such a group is reported, nested brackets included. An `OR` in one half of a
 * `UNION` leaves the other half alone.
 *
 * Nothing here parses. An `OR` inside a function's arguments or a `CASE`
 * marks its whole group too. That only ever leaves a column unfiltered, which
 * is the answer a query with no filter gets.
 */
export function simAthenaDisjunctivePositions(
  tokens: readonly SimAthenaSqlToken[],
): ReadonlySet<number> {
  const groups = bracketGroups(tokens);
  const positions = new Set<number>();

  for (const [position, group] of groups.groupOf.entries()) {
    if (insideDisjunction(group, groups)) {
      positions.add(position);
    }
  }

  return positions;
}

/** Which bracket group each token sits in, and which groups hold an `OR`. */
interface SimAthenaBracketGroups {
  /** The opening bracket's position for each token, by token position. */
  readonly groupOf: readonly number[];

  /** The group each group opened inside, keyed by its opening bracket. */
  readonly parentOf: ReadonlyMap<number, number>;

  /** The groups holding an `OR` directly, keyed by opening bracket. */
  readonly disjunctive: ReadonlySet<number>;
}

/**
 * Read the bracket groups once, from left to right.
 *
 * A `SELECT` starts a group of its own, keyed by its position, inside the
 * bracket around it. An unbalanced closing bracket returns to the statement
 * level.
 */
function bracketGroups(
  tokens: readonly SimAthenaSqlToken[],
): SimAthenaBracketGroups {
  const open: number[] = [statementLevel];
  const brackets: number[] = [statementLevel];
  const groupOf: number[] = [];
  const parentOf = new Map<number, number>();
  const disjunctive = new Set<number>();

  for (const [position, token] of tokens.entries()) {
    const current = open.at(-1) ?? statementLevel;
    groupOf.push(current);

    if (token.kind === "symbol" && token.text === "(") {
      parentOf.set(position, current);
      open.push(position);
      brackets.push(position);
    } else if (token.kind === "symbol" && token.text === ")") {
      open.length = Math.max(1, open.length - 1);
      brackets.length = Math.max(1, brackets.length - 1);
    } else if (token.kind === "word" && token.text === "select") {
      parentOf.set(position, brackets.at(-1) ?? statementLevel);
      open[open.length - 1] = position;
    } else if (token.kind === "word" && token.text === "or") {
      disjunctive.add(current);
    }
  }

  return { groupOf, parentOf, disjunctive };
}

/** Whether this group, or any group around it, holds an `OR`. */
function insideDisjunction(
  group: number,
  groups: SimAthenaBracketGroups,
): boolean {
  let cursor: number | undefined = group;

  while (cursor !== undefined) {
    if (groups.disjunctive.has(cursor)) {
      return true;
    }

    cursor = groups.parentOf.get(cursor);
  }

  return false;
}

/**
 * The legacy comparison operators: what each takes, and the expression it is
 * written as.
 */

/**
 * The fewest and the most values an operator compares against.
 */
export interface SimDynamoDbLegacyArity {
  readonly fewest: number;
  readonly most: number;
}

const none: SimDynamoDbLegacyArity = { fewest: 0, most: 0 };
const one: SimDynamoDbLegacyArity = { fewest: 1, most: 1 };
const two: SimDynamoDbLegacyArity = { fewest: 2, most: 2 };
const many: SimDynamoDbLegacyArity = {
  fewest: 1,
  most: Infinity,
};

/**
 * What one legacy operator takes, and the expression it is written as.
 */
export interface SimDynamoDbLegacyOperator {
  readonly arity: SimDynamoDbLegacyArity;

  /** The value types it takes, or nothing where it takes any. */
  readonly kinds?: ReadonlySet<string>;
  readonly render: (attribute: string, values: readonly string[]) => string;
}

/**
 * The most values one `IN` of an expression may hold. A legacy `IN` has no
 * such limit, so a longer list is written as several joined by `OR`.
 */
const inLimit = 100;

const scalars: ReadonlySet<string> = new Set(["S", "N", "B"]);

/**
 * Write a two-sided comparison with one value.
 */
function comparing(comparator: string): SimDynamoDbLegacyOperator {
  return {
    arity: one,
    kinds: scalars,
    render: (attribute, values) =>
      `${attribute} ${comparator} ${values.join("")}`,
  };
}

/**
 * Write a function call taking the attribute and then the value.
 */
function calling(
  name: string,
  kinds: ReadonlySet<string>,
): SimDynamoDbLegacyOperator {
  return {
    arity: one,
    kinds,
    render: (attribute, values) => `${name}(${attribute}, ${values.join("")})`,
  };
}

/**
 * Write an `IN`, splitting a list longer than an expression takes.
 */
function renderIn(attribute: string, values: readonly string[]): string {
  const groups: string[] = [];

  for (let start = 0; start < values.length; start += inLimit) {
    const group = values.slice(start, start + inLimit).join(", ");

    groups.push(`${attribute} IN (${group})`);
  }

  return groups.join(" OR ");
}

/**
 * Every legacy comparison operator AWS takes, by name.
 */
export const simDynamoDbLegacyOperators: ReadonlyMap<
  string,
  SimDynamoDbLegacyOperator
> = new Map([
  [
    "EQ",
    {
      arity: one,
      render: (attribute, values) => `${attribute} = ${values.join("")}`,
    },
  ],
  [
    "NE",
    {
      arity: one,
      render: (attribute, values) => `${attribute} <> ${values.join("")}`,
    },
  ],
  ["LE", comparing("<=")],
  ["LT", comparing("<")],
  ["GE", comparing(">=")],
  ["GT", comparing(">")],
  [
    "NOT_NULL",
    {
      arity: none,
      render: (attribute) => `attribute_exists(${attribute})`,
    },
  ],
  [
    "NULL",
    {
      arity: none,
      render: (attribute) => `attribute_not_exists(${attribute})`,
    },
  ],
  ["CONTAINS", calling("contains", scalars)],
  ["NOT_CONTAINS", { ...calling("contains", scalars), render: notContains }],
  ["BEGINS_WITH", calling("begins_with", new Set(["S", "B"]))],
  ["IN", { arity: many, kinds: scalars, render: renderIn }],
  [
    "BETWEEN",
    {
      arity: two,
      kinds: scalars,
      render: (attribute, values) =>
        `${attribute} BETWEEN ${values.join(" AND ")}`,
    },
  ],
]);

/**
 * Write a `NOT_CONTAINS`.
 */
function notContains(attribute: string, values: readonly string[]): string {
  return `NOT contains(${attribute}, ${values.join("")})`;
}

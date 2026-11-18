import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbComparisonKeyTerm } from "./sim-dynamodb-comparison-key-term.js";
import type { SimDynamoDbKeyConditionTerm } from "./sim-dynamodb-key-condition-term.js";

/**
 * One sort key attribute, and the term a key condition tests it with if any.
 */
export interface SimDynamoDbSortKeyTest {
  readonly attributeName: string;
  readonly term: SimDynamoDbKeyConditionTerm | undefined;
}

/**
 * Read the sort key terms of a key condition, in the order the key sorts by.
 *
 * A global secondary index may sort by up to four attributes. A query tests
 * them from the left, without skipping one, and every term but the last is an
 * equality. The last may be a range or a prefix. AWS answers anything else with
 * `Query key condition not supported`. A table sorts by one attribute at most,
 * so for a table these rules allow whatever the one term is.
 */
export function readSimDynamoDbSortKeyTerms(
  tests: readonly SimDynamoDbSortKeyTest[],
): readonly SimDynamoDbKeyConditionTerm[] {
  const terms: SimDynamoDbKeyConditionTerm[] = [];

  for (const [position, { attributeName, term }] of tests.entries()) {
    if (term === undefined) {
      assertNoneAfter(tests.slice(position + 1), attributeName);

      return terms;
    }

    const previous = terms.at(-1);

    if (previous !== undefined && !isEquality(previous)) {
      throw unsupported(
        `${previous.attributeName} is tested with ${previous.operator}, so ` +
          `no sort key attribute after it can be tested`,
      );
    }

    terms.push(term);
  }

  return terms;
}

/**
 * Refuse a term on a sort key attribute after one the condition skipped.
 */
function assertNoneAfter(
  rest: readonly SimDynamoDbSortKeyTest[],
  skipped: string,
): void {
  const tested = rest.find(({ term }) => term !== undefined);

  if (tested !== undefined) {
    throw unsupported(
      `${tested.attributeName} is tested and ${skipped} before it is ` +
        `skipped, and sort key attributes are tested from the left`,
    );
  }
}

/**
 * Whether a term holds its attribute equal to one value.
 */
function isEquality(term: SimDynamoDbKeyConditionTerm): boolean {
  return term instanceof SimDynamoDbComparisonKeyTerm && term.operator === "=";
}

/**
 * Build the refusal AWS gives a sort key condition it cannot walk.
 */
function unsupported(reason: string): SimDynamoDbValidationException {
  return new SimDynamoDbValidationException(
    `Query key condition not supported: ${reason}`,
  );
}

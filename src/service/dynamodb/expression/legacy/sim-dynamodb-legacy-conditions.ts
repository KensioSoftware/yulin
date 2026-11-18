import type { SimDynamoDbExpectedAttributeValue } from "../../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbLegacyComparison } from "./sim-dynamodb-legacy-comparison.js";
import type { SimDynamoDbLegacyPlaceholders } from "./sim-dynamodb-legacy-placeholders.js";

/**
 * The two ways a legacy condition can be joined.
 */
const conditionalOperators: ReadonlySet<string> = new Set(["AND", "OR"]);

/**
 * Write a record of legacy conditions as one condition expression.
 *
 * Each entry is written by the function given, and the entries are joined by
 * the `ConditionalOperator`, which is `AND` when the request leaves it out. A
 * record with nothing in it is no condition at all.
 */
export function simDynamoDbLegacyConditions<Entry>(
  entries: Readonly<Record<string, Entry>> | undefined,
  conditionalOperator: string | undefined,
  write: (attribute: string, entry: Entry) => string,
): string | undefined {
  const joiner = conditionalOperator ?? "AND";

  if (!conditionalOperators.has(joiner)) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: ConditionalOperator ` +
        `'${joiner}' is not one of AND, OR`,
    );
  }

  const written = Object.entries(entries ?? {}).map(([attribute, entry]) =>
    write(attribute, entry),
  );

  if (written.length === 0) {
    return undefined;
  }

  if (written.length === 1) {
    return written.join("");
  }

  return written.map((condition) => `(${condition})`).join(` ${joiner} `);
}

/**
 * Write one `Expected` entry as the condition it stands for.
 *
 * An entry says what it expects in one of two ways. `Value` and `Exists` are
 * the older, and expect the attribute to hold a value or to be absent.
 * `ComparisonOperator` and `AttributeValueList` are the newer, and compare the
 * way a filter does. AWS refuses an entry that mixes the two.
 */
export function simDynamoDbLegacyExpectation(
  attribute: string,
  expected: SimDynamoDbExpectedAttributeValue,
  placeholders: SimDynamoDbLegacyPlaceholders,
): string {
  const compares =
    expected.ComparisonOperator !== undefined ||
    expected.AttributeValueList !== undefined;
  const values = expected.Value !== undefined || expected.Exists !== undefined;

  if (compares && values) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Value and Exists cannot ` +
        `be used with ComparisonOperator and AttributeValueList, as ` +
        `${attribute} does`,
    );
  }

  return compares
    ? simDynamoDbLegacyComparison(attribute, expected, placeholders)
    : expectedValue(attribute, expected, placeholders);
}

/**
 * Write an `Expected` entry of the older kind, which names a value or says the
 * attribute is absent.
 */
function expectedValue(
  attribute: string,
  expected: SimDynamoDbExpectedAttributeValue,
  placeholders: SimDynamoDbLegacyPlaceholders,
): string {
  const name = placeholders.name(attribute);

  if (expected.Exists === false) {
    if (expected.Value !== undefined) {
      throw new SimDynamoDbValidationException(
        `One or more parameter values were invalid: Cannot expect an ` +
          `attribute to have a specified value while expecting it to not ` +
          `exist`,
      );
    }

    return `attribute_not_exists(${name})`;
  }

  if (expected.Value === undefined) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Exists is set to TRUE for ` +
        `attribute (${attribute}), Value must also be set`,
    );
  }

  return `${name} = ${placeholders.value(expected.Value)}`;
}

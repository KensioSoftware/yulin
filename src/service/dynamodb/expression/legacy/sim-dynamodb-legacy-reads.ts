import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbLegacyComparison } from "./sim-dynamodb-legacy-comparison.js";
import { simDynamoDbLegacyComparison } from "./sim-dynamodb-legacy-comparison.js";
import type { SimDynamoDbLegacyPlaceholders } from "./sim-dynamodb-legacy-placeholders.js";

/**
 * The operators a key condition can use. Each one can be answered from the
 * order an index keeps its items in.
 */
const keyOperators: ReadonlySet<string> = new Set([
  "EQ",
  "LE",
  "LT",
  "GE",
  "GT",
  "BEGINS_WITH",
  "BETWEEN",
]);

/**
 * The longest attribute name `AttributesToGet` takes, which AWS documents in
 * characters.
 */
const maximumNameLength = 65_535;

/**
 * Write an `AttributesToGet` list as the projection expression it stands for.
 *
 * AWS refuses an empty list, a list naming one attribute twice, and a name
 * over 65,535 characters.
 */
export function simDynamoDbLegacyProjection(
  attributes: readonly string[] | undefined,
  placeholders: SimDynamoDbLegacyPlaceholders,
): string | undefined {
  if (attributes === undefined) {
    return undefined;
  }

  if (attributes.length === 0) {
    throw new SimDynamoDbValidationException(
      `1 validation error detected: Value '[]' at 'attributesToGet' failed ` +
        `to satisfy constraint: Member must have length greater than or ` +
        `equal to 1`,
    );
  }

  const repeated = attributes.find(
    (attribute, index) => attributes.indexOf(attribute) !== index,
  );

  if (repeated !== undefined) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Duplicate value in ` +
        `attribute name: ${repeated}`,
    );
  }

  const tooLong = attributes.find(
    (attribute) => attribute.length > maximumNameLength,
  );

  if (tooLong !== undefined) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: AttributesToGet names an ` +
        `attribute of ${tooLong.length.toString()} characters, and an ` +
        `attribute name is at most ${maximumNameLength.toString()}`,
    );
  }

  return attributes.map((attribute) => placeholders.name(attribute)).join(", ");
}

/**
 * Write a `KeyConditions` record as the key condition expression it stands
 * for.
 *
 * Which attribute is the partition key, and whether the sort key condition is
 * one the key schema allows, is left to the key condition expression, which
 * checks both once the table is known.
 */
export function simDynamoDbLegacyKeyConditions(
  conditions: Readonly<Record<string, SimDynamoDbLegacyComparison>> | undefined,
  placeholders: SimDynamoDbLegacyPlaceholders,
): string | undefined {
  const entries = Object.entries(conditions ?? {});

  if (entries.length === 0) {
    return undefined;
  }

  return entries
    .map(([attribute, condition]) => {
      if (!keyOperators.has(condition.ComparisonOperator ?? "")) {
        throw new SimDynamoDbValidationException(
          `Attempted conditional constraint is not an indexable operation`,
        );
      }

      return simDynamoDbLegacyComparison(attribute, condition, placeholders);
    })
    .join(" AND ");
}

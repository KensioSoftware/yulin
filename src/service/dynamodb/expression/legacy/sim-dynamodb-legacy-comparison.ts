import type { SimDynamoDbAttributeValue } from "../../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { readSimDynamoDbValue } from "../../item/sim-dynamodb-value-reader.js";
import type {
  SimDynamoDbLegacyArity,
  SimDynamoDbLegacyOperator,
} from "./sim-dynamodb-legacy-operators.js";
import { simDynamoDbLegacyOperators } from "./sim-dynamodb-legacy-operators.js";
import type { SimDynamoDbLegacyPlaceholders } from "./sim-dynamodb-legacy-placeholders.js";

/**
 * One legacy comparison: an operator and the values it compares against.
 *
 * `Expected`, `KeyConditions`, `QueryFilter` and `ScanFilter` all write a
 * comparison this way.
 */
export interface SimDynamoDbLegacyComparison {
  readonly ComparisonOperator?: string | undefined;
  readonly AttributeValueList?:
    | readonly SimDynamoDbAttributeValue[]
    | undefined;
}

/**
 * Write one legacy comparison as the condition expression it stands for.
 *
 * The operator, the number of values and their types are all checked here, so
 * a comparison AWS would refuse is refused for what it says rather than for
 * the expression it would have become.
 */
export function simDynamoDbLegacyComparison(
  attribute: string,
  comparison: SimDynamoDbLegacyComparison,
  placeholders: SimDynamoDbLegacyPlaceholders,
): string {
  const name = comparison.ComparisonOperator ?? "";
  const operator = simDynamoDbLegacyOperators.get(name);

  if (operator === undefined) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: ComparisonOperator ` +
        `'${name}' for ${attribute} is not one of ${simDynamoDbLegacyOperators
          .keys()
          .toArray()
          .join(", ")}`,
    );
  }

  const values = comparison.AttributeValueList ?? [];

  assertArity(name, operator.arity, values.length);
  assertKinds(name, operator, values);

  return operator.render(
    placeholders.name(attribute),
    values.map((value) => placeholders.value(value)),
  );
}

/**
 * Refuse a comparison carrying the wrong number of values for its operator.
 */
function assertArity(
  name: string,
  arity: SimDynamoDbLegacyArity,
  count: number,
): void {
  if (count < arity.fewest || count > arity.most) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Invalid number of ` +
        `argument(s) for the ${name} ComparisonOperator`,
    );
  }
}

/**
 * Refuse a value of a type the operator does not take, and a `BETWEEN` or an
 * `IN` whose values differ in type.
 */
function assertKinds(
  name: string,
  operator: SimDynamoDbLegacyOperator,
  values: readonly SimDynamoDbAttributeValue[],
): void {
  const kinds = values.map((value) => readSimDynamoDbValue(value).kind);
  const refused = kinds.find((kind) => operator.kinds?.has(kind) === false);

  if (refused !== undefined) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: ComparisonOperator ` +
        `${name} is not valid for ${refused} AttributeValue type`,
    );
  }

  if (new Set(kinds).size > 1) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: AttributeValues inside ` +
        `AttributeValueList must be of same type`,
    );
  }
}

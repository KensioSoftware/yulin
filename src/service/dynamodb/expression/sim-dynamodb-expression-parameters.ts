import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { readSimDynamoDbValue } from "../item/sim-dynamodb-value-reader.js";
import type { SimDynamoDbValue } from "../item/sim-dynamodb-value.js";
import { SimDynamoDbExpressionPlaceholders } from "./sim-dynamodb-expression-placeholders.js";

/**
 * The two placeholder parameters a request can carry for its expressions.
 */
export interface SimDynamoDbExpressionParameterInput {
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly ExpressionAttributeValues?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
}

/**
 * The placeholders one request defines for its expressions.
 *
 * Every expression kind reads the same two parameters the same way, so they are
 * held together here rather than assembled per expression. Both are checked
 * once every expression on the request has been read, so a placeholder used by
 * any one of them counts as used.
 */
export class SimDynamoDbExpressionParameters {
  public readonly names: SimDynamoDbExpressionPlaceholders<string>;
  public readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;

  constructor(input: SimDynamoDbExpressionParameterInput) {
    this.names = new SimDynamoDbExpressionPlaceholders({
      parameterName: "ExpressionAttributeNames",
      marker: "#",
      entries: input.ExpressionAttributeNames,
    });
    this.values = new SimDynamoDbExpressionPlaceholders({
      parameterName: "ExpressionAttributeValues",
      marker: ":",
      entries: storedValues(input.ExpressionAttributeValues),
    });
  }

  /**
   * Refuse placeholders defined for an expression the request does not carry.
   *
   * Nothing would ever read them, and a request carrying them has almost
   * always lost its expression somewhere.
   */
  static assertNoneWithout(input: SimDynamoDbExpressionParameterInput): void {
    assertUnused(input.ExpressionAttributeNames, "Names");
    assertUnused(input.ExpressionAttributeValues, "Values");
  }

  /**
   * Refuse any entry no expression used.
   */
  assertAllUsed(): void {
    this.names.assertAllUsed();
    this.values.assertAllUsed();
  }
}

/**
 * Read the values a request supplied into the values a table holds.
 *
 * Reading them here is what checks them: a value an item could not carry is one
 * no expression could ever have matched.
 */
function storedValues(
  entries: Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined,
): Readonly<Record<string, SimDynamoDbValue>> {
  return Object.fromEntries(
    Object.entries(entries ?? {}).map(([placeholder, value]) => [
      placeholder,
      readSimDynamoDbValue(value),
    ]),
  );
}

/**
 * Refuse one parameter supplied with no expression to use it in.
 */
function assertUnused<Value>(
  entries: Readonly<Record<string, Value>> | undefined,
  suffix: string,
): void {
  if (Object.keys(entries ?? {}).length > 0) {
    throw new SimDynamoDbValidationException(
      `ExpressionAttribute${suffix} can only be specified when using ` +
        `expressions, and this request carries none`,
    );
  }
}

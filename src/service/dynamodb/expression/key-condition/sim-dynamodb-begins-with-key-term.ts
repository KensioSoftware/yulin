import type { SimDynamoDbScalarAttributeType } from "../../command/table/table.types.js";
import { simDynamoDbValueBeginsWith } from "../../item/sim-dynamodb-value-prefix.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { simDynamoDbKeyConditionError } from "./sim-dynamodb-key-condition-error.js";
import type { SimDynamoDbKeyConditionOperands } from "./sim-dynamodb-key-condition-operands.js";
import { simDynamoDbBeginsWithName } from "./sim-dynamodb-key-condition-refusals.js";
import type { SimDynamoDbKeyConditionTerm } from "./sim-dynamodb-key-condition-term.js";

interface SimDynamoDbBeginsWithKeyTermProperties {
  readonly attributeName: string;
  readonly prefix: SimDynamoDbValue;
}

interface SimDynamoDbBeginsWithKeyTermSource {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly operands: SimDynamoDbKeyConditionOperands;
}

/**
 * A sort key that starts with a value.
 */
export class SimDynamoDbBeginsWithKeyTerm implements SimDynamoDbKeyConditionTerm {
  public readonly attributeName: string;
  public readonly operator = "begins_with";

  private readonly prefix: SimDynamoDbValue;

  constructor(properties: SimDynamoDbBeginsWithKeyTermProperties) {
    this.attributeName = properties.attributeName;
    this.prefix = properties.prefix;
  }

  /**
   * Read `begins_with(sortKey, :prefix)` out of an expression.
   *
   * The call is read here rather than in the parser, since the shape of a call
   * belongs with the term it makes.
   */
  static read(
    source: SimDynamoDbBeginsWithKeyTermSource,
  ): SimDynamoDbBeginsWithKeyTerm {
    const { tokens, operands } = source;

    tokens.next(simDynamoDbBeginsWithName);
    tokens.next("(");

    const attributeName = operands.attributeName();
    tokens.expectSymbol(
      ",",
      `syntax error; ${simDynamoDbBeginsWithName} takes a key attribute and ` +
        `a value, separated by a comma`,
    );

    const prefix = operands.value();
    tokens.expectSymbol(
      ")",
      `syntax error; ${simDynamoDbBeginsWithName} is not closed`,
    );

    return new this({ attributeName, prefix });
  }

  /**
   * Whether a key value starts with the prefix.
   */
  holdsFor(value: SimDynamoDbValue): boolean {
    return simDynamoDbValueBeginsWith(value, this.prefix);
  }

  /**
   * Refuse a prefix against a Number sort key.
   *
   * A number is stored as a value rather than as the digits it was written
   * with, so `1E2` and `100` are one key and a prefix of either is meaningless.
   * Real DynamoDB refuses this too.
   */
  assertUsableOn(type: SimDynamoDbScalarAttributeType): void {
    if (type === "N") {
      throw simDynamoDbKeyConditionError(
        `begins_with reads a prefix of a String or Binary sort key, and ` +
          `${this.attributeName} is a Number`,
      );
    }
  }
}

import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import {
  type SimDynamoDbConditionOperand,
  SimDynamoDbValueOperand,
} from "./sim-dynamodb-condition-operand.js";
import type { SimDynamoDbConditionOperandParser } from "./sim-dynamodb-condition-operand-parser.js";

/**
 * The descriptors `attribute_type` can be asked about, which are the ones an
 * AttributeValue carries.
 */
const attributeTypes: ReadonlySet<string> = new Set([
  "S",
  "SS",
  "N",
  "NS",
  "B",
  "BS",
  "BOOL",
  "NULL",
  "L",
  "M",
]);

interface SimDynamoDbConditionFunctionArgumentsProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly operands: SimDynamoDbConditionOperandParser;
}

/**
 * Reads the arguments a condition function takes.
 *
 * Which function was called is the caller's business. What its arguments have
 * to look like is this one's, so the rules for a second operand and for the
 * type `attribute_type` names live in one place.
 */
export class SimDynamoDbConditionFunctionArguments {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly operands: SimDynamoDbConditionOperandParser;

  constructor(properties: SimDynamoDbConditionFunctionArgumentsProperties) {
    this.tokens = properties.tokens;
    this.operands = properties.operands;
  }

  /**
   * Read the second argument of a function that takes two.
   */
  second(): SimDynamoDbConditionOperand {
    this.tokens.expectSymbol(
      ",",
      "syntax error; a second operand was expected, separated by a comma",
    );

    return this.operands.parse();
  }

  /**
   * Read the type `attribute_type` is asking about.
   *
   * Real DynamoDB takes it as a string through ExpressionAttributeValues, and
   * refuses anything else, so a request naming the type inline is refused here
   * as well rather than read as an attribute called `S`.
   */
  attributeType(): string {
    const operand = this.second();
    const value = this.suppliedValue(operand);

    if (value?.kind !== "S" || !attributeTypes.has(value.text)) {
      throw this.tokens.error(
        `the second operand of attribute_type is one of ` +
          `${[...attributeTypes].join(", ")}, supplied through ` +
          `ExpressionAttributeValues, and '${operand.text}' is not`,
      );
    }

    return value.text;
  }

  /**
   * Read the second operand of `contains`, which has to differ from the first.
   *
   * Asking whether something contains itself has one answer whatever the item
   * holds, so real DynamoDB refuses it rather than always answering yes.
   *
   * They are told apart by what they name rather than by how they print, so
   * an attribute whose name carries a dot is not confused with the two
   * attributes it prints as.
   */
  distinctSecond(
    operand: SimDynamoDbConditionOperand,
  ): SimDynamoDbConditionOperand {
    const sought = this.second();

    if (operand.identity === sought.identity) {
      throw this.tokens.error(
        `the first operand must be distinct from the second operand for ` +
          `operator contains, and both are '${operand.text}'`,
      );
    }

    return sought;
  }

  /**
   * The value an operand carries, when it is one the request supplied rather
   * than a place in the item.
   */
  private suppliedValue(
    operand: SimDynamoDbConditionOperand,
  ): SimDynamoDbValueOperand["value"] | undefined {
    if (operand instanceof SimDynamoDbValueOperand) {
      return operand.value;
    }

    return undefined;
  }
}

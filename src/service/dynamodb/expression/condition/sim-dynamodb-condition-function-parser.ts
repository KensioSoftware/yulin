import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import type { SimDynamoDbCondition } from "./sim-dynamodb-condition.js";
import {
  SimDynamoDbAttributeExistsCondition,
  SimDynamoDbAttributeTypeCondition,
  SimDynamoDbBeginsWithCondition,
  SimDynamoDbContainsCondition,
} from "./sim-dynamodb-condition-function.js";
import { SimDynamoDbConditionFunctionArguments } from "./sim-dynamodb-condition-function-arguments.js";
import type { SimDynamoDbConditionOperandParser } from "./sim-dynamodb-condition-operand-parser.js";

/**
 * The functions that are a condition on their own, rather than an operand.
 *
 * `size` is not among them: it answers with a number, so it belongs beside a
 * comparator rather than in place of one.
 *
 * Real DynamoDB reads a function name in lower case only, so the same applies
 * here. `Attribute_Exists` is an attribute name there and here.
 */
const functionNames: ReadonlySet<string> = new Set([
  "attribute_exists",
  "attribute_not_exists",
  "attribute_type",
  "begins_with",
  "contains",
]);

interface SimDynamoDbConditionFunctionParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly operands: SimDynamoDbConditionOperandParser;
}

/**
 * Reads the function calls a condition expression is made of.
 */
export class SimDynamoDbConditionFunctionParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly operands: SimDynamoDbConditionOperandParser;
  private readonly arguments: SimDynamoDbConditionFunctionArguments;

  constructor(properties: SimDynamoDbConditionFunctionParserProperties) {
    this.tokens = properties.tokens;
    this.operands = properties.operands;
    this.arguments = new SimDynamoDbConditionFunctionArguments(properties);
  }

  /**
   * Whether what comes next is a function call rather than an operand.
   *
   * A function name followed by anything but an opening bracket is an ordinary
   * attribute name, since none of these words is reserved.
   */
  isFunctionCall(): boolean {
    const token = this.tokens.peek();
    const after = this.tokens.peek(1);

    return (
      token?.kind === "name" &&
      functionNames.has(token.text) &&
      after?.kind === "symbol" &&
      after.text === "("
    );
  }

  /**
   * Read one function call.
   */
  parse(): SimDynamoDbCondition {
    const name = this.tokens.next("a function name").text;
    this.tokens.next("(");

    const condition = this.called(name);
    this.tokens.expectSymbol(")", `syntax error; ${name} is not closed`);

    return condition;
  }

  /**
   * Read the arguments of the function that was named, and build it.
   */
  private called(name: string): SimDynamoDbCondition {
    switch (name) {
      case "attribute_exists": {
        return new SimDynamoDbAttributeExistsCondition(
          this.operands.parsePath(name),
          true,
        );
      }
      case "attribute_not_exists": {
        return new SimDynamoDbAttributeExistsCondition(
          this.operands.parsePath(name),
          false,
        );
      }
      case "attribute_type": {
        return new SimDynamoDbAttributeTypeCondition(
          this.operands.parsePath(name),
          this.arguments.attributeType(),
        );
      }
      case "begins_with": {
        return new SimDynamoDbBeginsWithCondition(
          this.operands.parsePath(name),
          this.arguments.second(),
        );
      }
      default: {
        return this.contains();
      }
    }
  }

  /**
   * Read `contains`, whose two operands have to differ.
   */
  private contains(): SimDynamoDbCondition {
    const operand = this.operands.parsePath("contains");

    return new SimDynamoDbContainsCondition(
      operand,
      this.arguments.distinctSecond(operand),
    );
  }
}

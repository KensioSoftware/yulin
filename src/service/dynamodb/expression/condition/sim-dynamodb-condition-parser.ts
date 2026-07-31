import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import {
  SimDynamoDbAndCondition,
  type SimDynamoDbCondition,
  SimDynamoDbNotCondition,
  SimDynamoDbOrCondition,
} from "./sim-dynamodb-condition.js";
import { SimDynamoDbConditionComparisonParser } from "./sim-dynamodb-condition-comparison-parser.js";
import { SimDynamoDbConditionFunctionParser } from "./sim-dynamodb-condition-function-parser.js";
import { SimDynamoDbConditionOperandParser } from "./sim-dynamodb-condition-operand-parser.js";

interface SimDynamoDbConditionParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
  readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
}

/**
 * Reads a condition expression into the condition it describes.
 *
 * The methods are the precedence DynamoDB documents, one method per level: OR
 * binds loosest, then AND, then NOT, and a comparison or a function binds
 * tightest. Writing it this way is what makes `a = :x OR b = :y AND c = :z` the
 * OR of `a = :x` and the AND, rather than the AND of the OR and `c = :z`.
 *
 * What a comparison and a function look like belongs to the parsers this one
 * delegates to, so this class stays the precedence and nothing else.
 */
export class SimDynamoDbConditionParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly comparisons: SimDynamoDbConditionComparisonParser;
  private readonly functions: SimDynamoDbConditionFunctionParser;

  constructor(properties: SimDynamoDbConditionParserProperties) {
    const operands = new SimDynamoDbConditionOperandParser({
      tokens: properties.tokens,
      names: properties.names,
      values: properties.values,
    });

    this.tokens = properties.tokens;
    this.comparisons = new SimDynamoDbConditionComparisonParser({
      tokens: properties.tokens,
      operands,
    });
    this.functions = new SimDynamoDbConditionFunctionParser({
      tokens: properties.tokens,
      operands,
    });
  }

  /**
   * Read the whole expression, refusing anything left over after it.
   */
  parse(): SimDynamoDbCondition {
    const condition = this.either();
    const remaining = this.tokens.peek();

    if (remaining !== undefined) {
      throw this.tokens.error(
        `syntax error; '${remaining.text}' follows a complete condition`,
      );
    }

    return condition;
  }

  /**
   * Conditions joined by OR, which binds loosest.
   */
  private either(): SimDynamoDbCondition {
    let condition = this.both();

    while (this.tokens.takeKeyword("OR")) {
      condition = new SimDynamoDbOrCondition(condition, this.both());
    }

    return condition;
  }

  /**
   * Conditions joined by AND, which binds tighter than OR.
   */
  private both(): SimDynamoDbCondition {
    let condition = this.negated();

    while (this.tokens.takeKeyword("AND")) {
      condition = new SimDynamoDbAndCondition(condition, this.negated());
    }

    return condition;
  }

  /**
   * A condition NOT applies to, which binds tighter than AND.
   */
  private negated(): SimDynamoDbCondition {
    if (this.tokens.takeKeyword("NOT")) {
      return new SimDynamoDbNotCondition(this.negated());
    }

    return this.innermost();
  }

  /**
   * A bracketed condition, a function call, or a comparison.
   */
  private innermost(): SimDynamoDbCondition {
    if (this.tokens.takeSymbol("(")) {
      const condition = this.either();
      this.tokens.expectSymbol(")", "syntax error; a bracket is not closed");

      return condition;
    }

    if (this.functions.isFunctionCall()) {
      return this.functions.parse();
    }

    return this.comparisons.parse();
  }
}

import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import type { SimDynamoDbCondition } from "./sim-dynamodb-condition.js";
import {
  SimDynamoDbBetweenCondition,
  SimDynamoDbComparisonCondition,
  SimDynamoDbInCondition,
  simDynamoDbComparators,
} from "./sim-dynamodb-condition-comparison.js";
import type { SimDynamoDbConditionOperand } from "./sim-dynamodb-condition-operand.js";
import type { SimDynamoDbConditionOperandParser } from "./sim-dynamodb-condition-operand-parser.js";

/**
 * Real DynamoDB takes at most 100 operands in an IN list.
 */
const greatestInOperands = 100;

interface SimDynamoDbConditionComparisonParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly operands: SimDynamoDbConditionOperandParser;
}

/**
 * Reads the three ways a condition expression puts one operand against others:
 * a comparator, a range, and a list.
 *
 * All three start with an operand and are told apart by what follows it, so
 * they are read together rather than tried one after another.
 */
export class SimDynamoDbConditionComparisonParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly operands: SimDynamoDbConditionOperandParser;

  constructor(properties: SimDynamoDbConditionComparisonParserProperties) {
    this.tokens = properties.tokens;
    this.operands = properties.operands;
  }

  /**
   * Read an operand and whatever it is put against.
   */
  parse(): SimDynamoDbCondition {
    const operand = this.operands.parse();

    if (this.tokens.takeKeyword("BETWEEN")) {
      return this.between(operand);
    }

    if (this.tokens.takeKeyword("IN")) {
      return this.within(operand);
    }

    return new SimDynamoDbComparisonCondition(
      operand,
      this.comparator(),
      this.operands.parse(),
    );
  }

  /**
   * `operand BETWEEN lower AND upper`, where both bounds count as inside.
   *
   * The AND here belongs to BETWEEN rather than joining two conditions, which
   * is why the range is read at this level rather than above AND.
   */
  private between(operand: SimDynamoDbConditionOperand): SimDynamoDbCondition {
    const lower = this.operands.parse();
    this.tokens.expectKeyword("AND");

    return new SimDynamoDbBetweenCondition(
      operand,
      lower,
      this.operands.parse(),
    );
  }

  /**
   * `operand IN (first, second, ...)`.
   */
  private within(operand: SimDynamoDbConditionOperand): SimDynamoDbCondition {
    this.tokens.expectSymbol("(", "syntax error; IN takes a bracketed list");

    const candidates = this.candidates();
    this.tokens.expectSymbol(")", "syntax error; the IN list is not closed");

    this.assertWithinInLimit(candidates.length);

    return new SimDynamoDbInCondition(operand, candidates);
  }

  /**
   * The operands of an IN list, up to its closing bracket.
   */
  private candidates(): readonly SimDynamoDbConditionOperand[] {
    const candidates: SimDynamoDbConditionOperand[] = [this.operands.parse()];

    while (this.tokens.takeSymbol(",")) {
      candidates.push(this.operands.parse());
    }

    return candidates;
  }

  /**
   * Read the comparator between two operands.
   */
  private comparator(): string {
    const token = this.tokens.next("a comparator");

    if (token.kind !== "symbol" || !simDynamoDbComparators.has(token.text)) {
      throw this.tokens.error(
        `syntax error; a comparator was expected, but '${token.text}' was given`,
      );
    }

    return token.text;
  }

  /**
   * Refuse an IN list longer than DynamoDB takes.
   */
  private assertWithinInLimit(count: number): void {
    if (count > greatestInOperands) {
      throw this.tokens.error(
        `IN takes at most ${greatestInOperands.toString()} operands, and ` +
          `${count.toString()} were given`,
      );
    }
  }
}

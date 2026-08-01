import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import { SimDynamoDbDocumentPathParser } from "../sim-dynamodb-document-path-parser.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import {
  type SimDynamoDbConditionOperand,
  SimDynamoDbPathOperand,
  SimDynamoDbSizeOperand,
  SimDynamoDbValueOperand,
} from "./sim-dynamodb-condition-operand.js";

/**
 * The one function that stands where an operand does rather than being a
 * condition of its own, because it answers with a number rather than with yes
 * or no.
 */
const sizeFunctionName = "size";

interface SimDynamoDbConditionOperandParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
  readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
}

/**
 * Reads the operands a condition expression compares.
 *
 * An operand is a document path, a value the request supplied, or the size of
 * what a path points at. Which one it is shows in its first token, so nothing
 * here has to look far ahead.
 */
export class SimDynamoDbConditionOperandParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly names: SimDynamoDbExpressionPlaceholders<string>;
  private readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
  private readonly read: SimDynamoDbDocumentPath[] = [];

  constructor(properties: SimDynamoDbConditionOperandParserProperties) {
    this.tokens = properties.tokens;
    this.names = properties.names;
    this.values = properties.values;
  }

  /**
   * Every place in the item the expression named, in the order it named them.
   *
   * A condition on a write has no use for these, since it is checked against
   * one item the request already named. A filter does: which attributes it
   * names is what a query is held to.
   */
  get paths(): readonly SimDynamoDbDocumentPath[] {
    return this.read;
  }

  /**
   * Read one operand.
   */
  parse(): SimDynamoDbConditionOperand {
    const token = this.tokens.peek();

    if (token?.kind === "valuePlaceholder") {
      this.tokens.next("a value");

      return new SimDynamoDbValueOperand(
        token.text,
        this.values.required(token.text),
      );
    }

    if (this.isSizeCall()) {
      return this.size();
    }

    return this.path();
  }

  /**
   * Read an operand that has to be a document path, naming the function that
   * will not take anything else.
   */
  parsePath(functionName: string): SimDynamoDbPathOperand {
    const operand = this.parse();

    if (!(operand instanceof SimDynamoDbPathOperand)) {
      throw this.tokens.error(
        `the first operand of ${functionName} names a place in the item, and ` +
          `'${operand.text}' is not one`,
      );
    }

    return operand;
  }

  /**
   * Whether what comes next is a call to `size` rather than a path starting
   * with an attribute of that name.
   */
  private isSizeCall(): boolean {
    const token = this.tokens.peek();
    const after = this.tokens.peek(1);

    return (
      token?.kind === "name" &&
      token.text === sizeFunctionName &&
      after?.kind === "symbol" &&
      after.text === "("
    );
  }

  /**
   * Read `size(path)`, which is a number rather than a condition.
   */
  private size(): SimDynamoDbConditionOperand {
    this.tokens.next(sizeFunctionName);
    this.tokens.next("(");

    const measured = this.path();
    this.tokens.expectSymbol(
      ")",
      `syntax error; ${sizeFunctionName} is not closed`,
    );

    return new SimDynamoDbSizeOperand(measured);
  }

  /**
   * Read a document path, which is what an operand is when it is nothing else.
   */
  private path(): SimDynamoDbPathOperand {
    const path = new SimDynamoDbDocumentPathParser({
      tokens: this.tokens,
      names: this.names,
    }).parse();

    this.read.push(path);

    return new SimDynamoDbPathOperand(path);
  }
}

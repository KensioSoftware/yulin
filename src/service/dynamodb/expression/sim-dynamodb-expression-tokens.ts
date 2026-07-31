import { simDynamoDbExpressionError } from "./sim-dynamodb-expression-error.js";
import type { SimDynamoDbExpressionToken } from "./sim-dynamodb-expression-token.js";

interface SimDynamoDbExpressionTokensProperties {
  readonly expressionName: string;
  readonly tokens: readonly SimDynamoDbExpressionToken[];
}

/**
 * A parser's place in the tokens of one expression.
 *
 * Every expression kind is parsed by reading forwards through its tokens, so
 * how far along it is, and what happens when it runs out, live here rather than
 * in each parser.
 */
export class SimDynamoDbExpressionTokens {
  private readonly expressionName: string;
  private readonly tokens: readonly SimDynamoDbExpressionToken[];
  private position = 0;

  constructor(properties: SimDynamoDbExpressionTokensProperties) {
    this.expressionName = properties.expressionName;
    this.tokens = properties.tokens;
  }

  /**
   * Whether every token has been read.
   */
  get atEnd(): boolean {
    return this.position >= this.tokens.length;
  }

  /**
   * The next token, without reading it.
   */
  peek(): SimDynamoDbExpressionToken | undefined {
    return this.tokens[this.position];
  }

  /**
   * Read the next token, refusing an expression that has run out.
   */
  next(expected: string): SimDynamoDbExpressionToken {
    const upcoming = this.peek();

    if (upcoming === undefined) {
      throw this.error(
        `syntax error; ${expected} expected, but the expression ended`,
      );
    }

    this.position += 1;

    return upcoming;
  }

  /**
   * Read the next token when it is a symbol, and leave it otherwise.
   */
  takeSymbol(text: string): boolean {
    const candidate = this.peek();

    if (candidate?.kind !== "symbol" || candidate.text !== text) {
      return false;
    }

    this.position += 1;

    return true;
  }

  /**
   * Build the error this expression is refused with.
   */
  error(reason: string): Error {
    return simDynamoDbExpressionError(this.expressionName, reason);
  }
}

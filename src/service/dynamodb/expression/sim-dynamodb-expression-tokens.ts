import { simDynamoDbExpressionError } from "./sim-dynamodb-expression-error.js";
import type { SimDynamoDbExpressionToken } from "./sim-dynamodb-expression-token.js";
import { SimDynamoDbExpressionTokeniser } from "./sim-dynamodb-expression-tokeniser.js";

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
   * Read an expression into the tokens a parser walks.
   *
   * An expression with nothing in it is refused here rather than by each
   * parser, since none of them has anything to read either way. The reason
   * says what that expression kind would have been asking for.
   */
  static of(
    expressionName: string,
    expression: string,
    emptyReason: string,
  ): SimDynamoDbExpressionTokens {
    const read = new this({
      expressionName,
      tokens: new SimDynamoDbExpressionTokeniser({ expressionName }).tokenise(
        expression,
      ),
    });

    if (read.atEnd) {
      throw simDynamoDbExpressionError(expressionName, emptyReason);
    }

    return read;
  }

  /**
   * Whether every token has been read.
   */
  get atEnd(): boolean {
    return this.position >= this.tokens.length;
  }

  /**
   * The next token, without reading it.
   *
   * An offset looks further ahead, which is what tells a function call from a
   * document path that happens to start with the same word.
   */
  peek(offset = 0): SimDynamoDbExpressionToken | undefined {
    return this.tokens.at(this.position + offset);
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
   * Read a symbol the expression has to carry here.
   */
  expectSymbol(text: string, reason: string): void {
    if (!this.takeSymbol(text)) {
      throw this.error(reason);
    }
  }

  /**
   * Read the next token when it is a keyword, and leave it otherwise.
   *
   * A keyword arrives as a name, since that is what it looks like. DynamoDB
   * reads AND, OR, NOT, BETWEEN and IN whatever case they are written in, so
   * they are matched that way here.
   */
  takeKeyword(word: string): boolean {
    const candidate = this.peek();

    if (candidate?.kind !== "name" || !this.isKeyword(candidate.text, word)) {
      return false;
    }

    this.position += 1;

    return true;
  }

  /**
   * Read a keyword the expression has to carry here.
   */
  expectKeyword(word: string): void {
    if (!this.takeKeyword(word)) {
      throw this.error(
        `syntax error; ${word} expected, but ` +
          `'${this.peek()?.text ?? "the end of the expression"}' was given`,
      );
    }
  }

  /**
   * Build the error this expression is refused with.
   */
  error(reason: string): Error {
    return simDynamoDbExpressionError(this.expressionName, reason);
  }

  /**
   * Whether some text is a keyword, whatever case it was written in.
   */
  private isKeyword(text: string, word: string): boolean {
    return text.toUpperCase() === word;
  }
}

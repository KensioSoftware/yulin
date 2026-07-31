import type { SimDynamoDbExpressionToken } from "./sim-dynamodb-expression-token.js";
import { SimDynamoDbExpressionTokenReader } from "./sim-dynamodb-expression-token-reader.js";

/**
 * The gap between two tokens, which means nothing on its own.
 */
const whitespacePattern = /^\s+/;

interface SimDynamoDbExpressionTokeniserProperties {
  readonly expressionName: string;
}

/**
 * Reads a DynamoDB expression into the pieces it is made of.
 *
 * Every expression parameter DynamoDB has is written in the same lexical
 * shapes, so they are read here once rather than once per expression kind.
 * What the pieces are allowed to say is left to whatever parses them.
 *
 * This walks the expression and records where each token was found. What each
 * kind of token looks like belongs to
 * {@link SimDynamoDbExpressionTokenReader}.
 */
export class SimDynamoDbExpressionTokeniser {
  private readonly reader: SimDynamoDbExpressionTokenReader;

  constructor(properties: SimDynamoDbExpressionTokeniserProperties) {
    this.reader = new SimDynamoDbExpressionTokenReader(
      properties.expressionName,
    );
  }

  /**
   * Read an expression into its tokens, skipping the whitespace between them.
   */
  tokenise(expression: string): readonly SimDynamoDbExpressionToken[] {
    const tokens: SimDynamoDbExpressionToken[] = [];
    let position = 0;

    while (position < expression.length) {
      const remaining = expression.slice(position);
      const whitespace = whitespacePattern.exec(remaining)?.[0];

      if (whitespace === undefined) {
        const read = this.reader.read(remaining);

        tokens.push({ ...read, position });
        position += read.text.length;
      } else {
        position += whitespace.length;
      }
    }

    return tokens;
  }
}

import { simDynamoDbExpressionError } from "./sim-dynamodb-expression-error.js";
import type {
  SimDynamoDbExpressionToken,
  SimDynamoDbExpressionTokenKind,
} from "./sim-dynamodb-expression-token.js";

/**
 * An attribute name written into an expression: a letter or underscore, then
 * letters, numbers and underscores. A name outside that has to be written as an
 * ExpressionAttributeNames placeholder, on real DynamoDB as well as here.
 */
const namePattern = /^[A-Za-z_]\w*/;

/**
 * A placeholder, after its leading `#` or `:`.
 */
const placeholderPattern = /^\w+/;

/**
 * The whole part of a number, which is a list index in the expressions
 * supported so far.
 */
const digitsPattern = /^\d+/;

/**
 * The fractional part of a number, read straight after the whole part.
 *
 * A fraction is read as one number rather than as a number, a dot and another
 * number, so an index of `1.5` is refused as a fraction rather than as a
 * syntax error somewhere after it.
 */
const fractionPattern = /^\.\d+/;

/**
 * The single characters that mean something in the expressions supported so
 * far.
 *
 * This set grows as condition, filter and update expressions arrive. Until
 * then, a character outside it is refused rather than passed through, so an
 * expression this simulation cannot evaluate fails rather than half works.
 */
const symbols: ReadonlySet<string> = new Set([".", ",", "[", "]", "-"]);

/**
 * A token before it is told where in the expression it was found.
 */
export type SimDynamoDbUnplacedToken = Omit<
  SimDynamoDbExpressionToken,
  "position"
>;

/**
 * Reads the one token an expression starts with.
 *
 * This knows what each kind of token looks like. Where the tokens are and what
 * order they come in is not its business, so it takes whatever is left of an
 * expression and answers with the first thing in it.
 */
export class SimDynamoDbExpressionTokenReader {
  private readonly expressionName: string;

  constructor(expressionName: string) {
    this.expressionName = expressionName;
  }

  /**
   * Read the token at the start of what is left of an expression.
   */
  read(remaining: string): SimDynamoDbUnplacedToken {
    return (
      this.name(remaining) ??
      this.placeholder("namePlaceholder", "#", remaining) ??
      this.placeholder("valuePlaceholder", ":", remaining) ??
      this.number(remaining) ??
      this.symbol(remaining)
    );
  }

  /**
   * Read an attribute name written into the expression itself.
   */
  private name(remaining: string): SimDynamoDbUnplacedToken | undefined {
    const text = namePattern.exec(remaining)?.[0];

    if (text === undefined) {
      return undefined;
    }

    return { kind: "name", text };
  }

  /**
   * Read a placeholder, which is its marker and the word after it.
   *
   * A marker with no word after it is refused here rather than read as a
   * marker on its own, since a bare `#` names nothing.
   */
  private placeholder(
    kind: SimDynamoDbExpressionTokenKind,
    marker: string,
    remaining: string,
  ): SimDynamoDbUnplacedToken | undefined {
    if (!remaining.startsWith(marker)) {
      return undefined;
    }

    const named = remaining.slice(marker.length);
    const word = placeholderPattern.exec(named)?.[0];

    if (word === undefined) {
      throw this.error(
        `syntax error; the placeholder marker '${marker}' names nothing`,
      );
    }

    return { kind, text: `${marker}${word}` };
  }

  /**
   * Read a number, which is its digits and the fraction after them if it has
   * one.
   */
  private number(remaining: string): SimDynamoDbUnplacedToken | undefined {
    const digits = digitsPattern.exec(remaining)?.[0];

    if (digits === undefined) {
      return undefined;
    }

    const after = remaining.slice(digits.length);
    const fraction = fractionPattern.exec(after)?.[0] ?? "";

    return { kind: "number", text: `${digits}${fraction}` };
  }

  /**
   * Read a single character that means something on its own.
   */
  private symbol(remaining: string): SimDynamoDbUnplacedToken {
    const character = remaining.slice(0, 1);

    if (!symbols.has(character)) {
      throw this.error(`syntax error; unexpected character '${character}'`);
    }

    return { kind: "symbol", text: character };
  }

  /**
   * Build the error the expression being read is refused with.
   */
  private error(reason: string): Error {
    return simDynamoDbExpressionError(this.expressionName, reason);
  }
}

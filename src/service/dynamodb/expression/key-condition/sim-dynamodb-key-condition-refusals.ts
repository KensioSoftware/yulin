import type { SimDynamoDbExpressionToken } from "../sim-dynamodb-expression-token.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { simDynamoDbKeyConditionError } from "./sim-dynamodb-key-condition-error.js";

/**
 * The one function a key condition takes, read in lower case as real DynamoDB
 * reads it.
 */
export const simDynamoDbBeginsWithName = "begins_with";

/**
 * The boolean operators a key condition has no place for.
 */
const refusedKeywords: ReadonlySet<string> = new Set(["OR", "NOT"]);

/**
 * The symbols that dereference the attribute before them.
 */
const dereferenceSymbols: ReadonlySet<string> = new Set([".", "["]);

/**
 * What a key condition is refused for being, rather than for what it says.
 *
 * These are the shapes the general condition grammar takes and a key condition
 * does not. They are a group of their own because each is about telling a
 * caller which part of that grammar has no place here, rather than about
 * building anything.
 */
export class SimDynamoDbKeyConditionRefusals {
  private readonly tokens: SimDynamoDbExpressionTokens;

  constructor(tokens: SimDynamoDbExpressionTokens) {
    this.tokens = tokens;
  }

  /**
   * Refuse the boolean operators a key condition has no place for.
   *
   * `OR` and `NOT` are reserved words in an expression, so an attribute of
   * either name is written as a placeholder and never arrives here.
   */
  assertNoLogicalOperator(): void {
    const token = this.tokens.peek();

    if (token?.kind !== "name") {
      return;
    }

    const word = token.text.toUpperCase();

    if (!refusedKeywords.has(word)) {
      return;
    }

    throw simDynamoDbKeyConditionError(
      `${word} is not part of a key condition. A key condition tests the ` +
        `partition key for equality, and may add one sort key condition ` +
        `after AND.`,
    );
  }

  /**
   * Refuse a bracketed term.
   *
   * Brackets group a condition, and there is nothing here to group: the shape
   * of a key condition is fixed. Refusing them is stricter than real DynamoDB,
   * and is recorded in the Limitations section of the usage docs.
   */
  assertNoBracket(): void {
    const token = this.tokens.peek();

    if (token?.kind === "symbol" && token.text === "(") {
      throw simDynamoDbKeyConditionError(
        `a key condition takes no brackets: it is one partition key ` +
          `equality, optionally with one sort key condition after AND`,
      );
    }
  }

  /**
   * Whether the next term is a `begins_with` call, refusing any other function.
   *
   * A function name followed by anything but an opening bracket is an ordinary
   * attribute name, since none of these words is reserved.
   */
  takesBeginsWith(): boolean {
    const called = this.calledFunction();

    if (called === undefined) {
      return false;
    }

    if (called !== simDynamoDbBeginsWithName) {
      throw simDynamoDbKeyConditionError(
        `${called} is not a key condition function. ` +
          `${simDynamoDbBeginsWithName} is the only one a sort key condition ` +
          `uses.`,
      );
    }

    return true;
  }

  /**
   * Refuse a term dereferencing the attribute it names.
   */
  assertNotNested(attributeName: string): void {
    const token = this.tokens.peek();

    if (token?.kind === "symbol" && dereferenceSymbols.has(token.text)) {
      throw simDynamoDbKeyConditionError(
        `${attributeName} is followed by '${token.text}', and a key condition ` +
          `names a top-level attribute: a key is scalar and cannot be nested`,
      );
    }
  }

  /**
   * Refuse anything left over after the last term of an expression.
   */
  assertNothingFollows(): void {
    this.assertNoLogicalOperator();

    const remaining = this.tokens.peek();

    if (remaining !== undefined) {
      throw simDynamoDbKeyConditionError(
        `syntax error; '${remaining.text}' follows a complete key condition`,
      );
    }
  }

  /**
   * The name of the function the next term calls, if it calls one.
   */
  private calledFunction(): string | undefined {
    const token = this.tokens.peek();

    if (token?.kind !== "name" || !opensBracket(this.tokens.peek(1))) {
      return undefined;
    }

    return token.text;
  }
}

/**
 * Whether a token is the bracket that makes the name before it a call.
 */
function opensBracket(token: SimDynamoDbExpressionToken | undefined): boolean {
  return token?.kind === "symbol" && token.text === "(";
}

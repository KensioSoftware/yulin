import { SimDynamoDbDocumentPathParser } from "../sim-dynamodb-document-path-parser.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { simDynamoDbUpdateError } from "./sim-dynamodb-update-refusal.js";
import { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";

/**
 * The clause keywords an update expression is made of.
 */
const clauseWords: ReadonlySet<string> = new Set([
  "SET",
  "REMOVE",
  "ADD",
  "DELETE",
]);

interface SimDynamoDbUpdateClausesProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
}

/**
 * The clauses of an update expression, and the paths their actions write to.
 *
 * Which clause an expression is in decides what its actions look like, so
 * reading the keywords and the paths lives here and the actions themselves are
 * built by the parser around it.
 */
export class SimDynamoDbUpdateClauses {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly names: SimDynamoDbExpressionPlaceholders<string>;
  private readonly read = new Set<string>();

  constructor(properties: SimDynamoDbUpdateClausesProperties) {
    this.tokens = properties.tokens;
    this.names = properties.names;
  }

  /**
   * Read the keyword the next clause starts with, refusing one already used.
   */
  keyword(): string {
    const token = this.tokens.next("a clause keyword");
    const word = token.text.toUpperCase();

    if (token.kind !== "name" || !clauseWords.has(word)) {
      throw simDynamoDbUpdateError(
        `syntax error; SET, REMOVE, ADD or DELETE expected, but ` +
          `'${token.text}' was given`,
      );
    }

    if (this.read.has(word)) {
      throw simDynamoDbUpdateError(
        `The "${word}" section can only be used once in an update expression;`,
      );
    }

    this.read.add(word);

    return word;
  }

  /**
   * Read the document path one action writes to.
   */
  target(): SimDynamoDbUpdateTarget {
    return new SimDynamoDbUpdateTarget(
      new SimDynamoDbDocumentPathParser({
        tokens: this.tokens,
        names: this.names,
      }).parse(),
    );
  }

  /**
   * Read the top-level attribute an ADD or DELETE action changes.
   *
   * Both work on an attribute of the item and nothing inside one, as they do on
   * AWS.
   */
  attributeTarget(word: string): SimDynamoDbUpdateTarget {
    const target = this.target();

    if (!target.topLevel) {
      throw simDynamoDbUpdateError(
        `${word} works on an attribute of the item, and '${target.text}' ` +
          `names something inside one`,
      );
    }

    return target;
  }
}

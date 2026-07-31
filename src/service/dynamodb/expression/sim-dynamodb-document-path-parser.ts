import {
  SimDynamoDbDocumentPath,
  type SimDynamoDbDocumentPathSegment,
} from "./sim-dynamodb-document-path.js";
import type { SimDynamoDbExpressionPlaceholders } from "./sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "./sim-dynamodb-expression-tokens.js";

/**
 * Real DynamoDB stops at 32 levels of nesting inside one attribute, so a path
 * reaching past that is pointing where an item cannot go.
 */
const greatestDepth = 32;

interface SimDynamoDbDocumentPathParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
}

/**
 * Reads one document path out of an expression.
 *
 * Every expression kind DynamoDB has points at parts of an item the same way,
 * so paths are read here once. The parser stops at the first token that cannot
 * continue the path, leaving it for whatever is reading the expression around
 * it, such as the comma between two projected paths.
 */
export class SimDynamoDbDocumentPathParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly names: SimDynamoDbExpressionPlaceholders<string>;
  private readonly segments: SimDynamoDbDocumentPathSegment[] = [];

  constructor(properties: SimDynamoDbDocumentPathParserProperties) {
    this.tokens = properties.tokens;
    this.names = properties.names;
  }

  /**
   * Read a path, from its first attribute to the last thing it dereferences.
   */
  parse(): SimDynamoDbDocumentPath {
    this.segments.push(this.attribute());

    while (this.continues()) {
      this.assertWithinDepth();
    }

    return new SimDynamoDbDocumentPath(this.segments);
  }

  /**
   * Read the next step of the path, answering whether there was one.
   */
  private continues(): boolean {
    if (this.tokens.takeSymbol(".")) {
      this.segments.push(this.attribute());

      return true;
    }

    if (this.tokens.takeSymbol("[")) {
      this.segments.push({ kind: "index", index: this.index() });

      return true;
    }

    return false;
  }

  /**
   * Read an attribute name, which the request may have written as a
   * placeholder.
   */
  private attribute(): SimDynamoDbDocumentPathSegment {
    const token = this.tokens.next("an attribute name");

    if (token.kind === "name") {
      return { kind: "attribute", name: token.text };
    }

    if (token.kind === "namePlaceholder") {
      return { kind: "attribute", name: this.names.required(token.text) };
    }

    throw this.tokens.error(
      `syntax error; an attribute name was expected${this.after()}, but ` +
        `'${token.text}' was given`,
    );
  }

  /**
   * Read a list index, and the bracket that closes it.
   */
  private index(): number {
    if (this.tokens.takeSymbol("-")) {
      throw this.pathError("a list index cannot be negative");
    }

    const token = this.tokens.next("a list index");
    const index = Number(token.text);

    // A fraction is refused on how it was written rather than on what it works
    // out to, so `[2.0]` is refused along with `[2.5]`. Real DynamoDB reads an
    // index as digits, and one written any other way is a syntax error there
    // whether or not it lands on a whole number.
    if (
      token.kind !== "number" ||
      token.text.includes(".") ||
      !Number.isSafeInteger(index)
    ) {
      throw this.pathError(
        `a list index is a whole number, and '${token.text}' is not`,
      );
    }

    if (!this.tokens.takeSymbol("]")) {
      throw this.pathError("a list index has no closing ']'");
    }

    return index;
  }

  /**
   * Refuse a path pointing deeper than an item can nest.
   */
  private assertWithinDepth(): void {
    if (this.segments.length > greatestDepth) {
      throw this.pathError(
        `a document path goes at most ${greatestDepth.toString()} levels ` +
          `deep, which is as far as an item nests`,
      );
    }
  }

  /**
   * Build an error naming the path as far as it was read.
   */
  private pathError(reason: string): Error {
    return this.tokens.error(`${reason}${this.after()}`);
  }

  /**
   * Where in the path something went wrong, for a refusal to name.
   */
  private after(): string {
    const read = new SimDynamoDbDocumentPath(this.segments).text;

    if (read === "") {
      return "";
    }

    return ` in the document path '${read}'`;
  }
}

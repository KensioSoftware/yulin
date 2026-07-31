import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

interface SimDynamoDbExpressionPlaceholdersProperties<Value> {
  /** The request parameter the entries came from, for a refusal to name. */
  readonly parameterName: string;
  /** The marker every key of that parameter starts with, `#` or `:`. */
  readonly marker: string;
  readonly entries?: Readonly<Record<string, Value>> | undefined;
}

/**
 * The placeholders one request parameter defines for its expressions.
 *
 * `ExpressionAttributeNames` and `ExpressionAttributeValues` work the same way:
 * a map of placeholders to what they stand for, where the expression and the
 * map have to agree exactly. This holds either of them.
 *
 * It fails closed in both directions. A placeholder an expression uses and the
 * request does not define is refused, and so is an entry the request defines
 * and no expression uses. Real DynamoDB refuses both, and the unused one is
 * what a request hits after an expression is edited and the old placeholder is
 * left behind.
 */
export class SimDynamoDbExpressionPlaceholders<Value> {
  private readonly parameterName: string;
  private readonly marker: string;
  private readonly entries: ReadonlyMap<string, Value>;
  private readonly used = new Set<string>();

  constructor(properties: SimDynamoDbExpressionPlaceholdersProperties<Value>) {
    this.parameterName = properties.parameterName;
    this.marker = properties.marker;
    this.entries = new Map(Object.entries(properties.entries ?? {}));

    this.assertKeysArePlaceholders();
  }

  /**
   * What a placeholder stands for, refusing one the request never defined.
   */
  required(placeholder: string): Value {
    const value = this.entries.get(placeholder);

    if (value === undefined) {
      throw new SimDynamoDbValidationException(
        `${this.parameterName} does not define ${placeholder}, which an ` +
          `expression uses`,
      );
    }

    this.used.add(placeholder);

    return value;
  }

  /**
   * Refuse an entry no expression used.
   *
   * Called once every expression on the request has been read, so a placeholder
   * used by any one of them counts as used.
   */
  assertAllUsed(): void {
    const unused = this.entries
      .keys()
      .filter((placeholder) => !this.used.has(placeholder))
      .toArray();

    if (unused.length > 0) {
      throw new SimDynamoDbValidationException(
        `Value provided in ${this.parameterName} is unused in ` +
          `expressions: ${unused.join(", ")}`,
      );
    }
  }

  /**
   * Refuse a key that is not a placeholder at all.
   *
   * A map keyed by the bare attribute name rather than by `#name` would leave
   * every placeholder in the expression undefined, which is a confusing way to
   * find out the key was written wrong.
   */
  private assertKeysArePlaceholders(): void {
    for (const key of this.entries.keys()) {
      if (!key.startsWith(this.marker)) {
        throw new SimDynamoDbValidationException(
          `${this.parameterName} contains the invalid key ${key}. A ` +
            `placeholder starts with '${this.marker}'.`,
        );
      }
    }
  }
}

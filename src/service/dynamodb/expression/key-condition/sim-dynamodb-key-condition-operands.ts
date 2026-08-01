import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { simDynamoDbKeyConditionError } from "./sim-dynamodb-key-condition-error.js";
import {
  simDynamoDbBeginsWithName,
  type SimDynamoDbKeyConditionRefusals,
} from "./sim-dynamodb-key-condition-refusals.js";

/**
 * The comparators a key condition puts between a key attribute and a value.
 *
 * `<>` is not among them. A query reads a contiguous run of the sort key, and
 * "everything except this one" is not one.
 */
const keyComparators: ReadonlySet<string> = new Set([
  "=",
  "<",
  "<=",
  ">",
  ">=",
]);

interface SimDynamoDbKeyConditionOperandsProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
  readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
  readonly refusals: SimDynamoDbKeyConditionRefusals;
}

/**
 * The three pieces every key condition term is built from: the key attribute,
 * the comparator, and the value.
 *
 * They are read here rather than in the parser, so the parser stays the shape a
 * key condition is allowed to take.
 */
export class SimDynamoDbKeyConditionOperands {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly names: SimDynamoDbExpressionPlaceholders<string>;
  private readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
  private readonly refusals: SimDynamoDbKeyConditionRefusals;

  constructor(properties: SimDynamoDbKeyConditionOperandsProperties) {
    this.tokens = properties.tokens;
    this.names = properties.names;
    this.values = properties.values;
    this.refusals = properties.refusals;
  }

  /**
   * Read the name of the key attribute a term names.
   *
   * A key attribute is a top-level attribute, so this reads one token rather
   * than a document path: a key is scalar, and nothing in the closed grammar
   * dereferences one.
   */
  attributeName(): string {
    const token = this.tokens.next("a key attribute name");

    if (token.kind !== "name" && token.kind !== "namePlaceholder") {
      throw simDynamoDbKeyConditionError(
        `syntax error; a key attribute name was expected, but ` +
          `'${token.text}' was given`,
      );
    }

    const attributeName = this.nameOf(token.kind, token.text);

    this.refusals.assertNotNested(attributeName);

    return attributeName;
  }

  /**
   * Read the value a term compares against, which is always supplied.
   *
   * Key conditions have no literals, so every value arrives through
   * `ExpressionAttributeValues`.
   */
  value(): SimDynamoDbValue {
    const token = this.tokens.next("a value placeholder");

    if (token.kind !== "valuePlaceholder") {
      throw simDynamoDbKeyConditionError(
        `a key condition compares a key attribute against a value from ` +
          `ExpressionAttributeValues, and '${token.text}' is not one`,
      );
    }

    return this.values.required(token.text);
  }

  /**
   * Read the comparator between a key attribute and a value.
   */
  comparator(): string {
    const token = this.tokens.next("a comparator");

    if (token.kind !== "symbol" || !keyComparators.has(token.text)) {
      throw simDynamoDbKeyConditionError(
        `'${token.text}' is not a key condition operator. A key condition ` +
          `uses =, <, <=, >, >=, BETWEEN or ${simDynamoDbBeginsWithName}.`,
      );
    }

    return token.text;
  }

  /**
   * The attribute a name token stands for, which may be a placeholder.
   */
  private nameOf(kind: string, text: string): string {
    if (kind === "name") {
      return text;
    }

    return this.names.required(text);
  }
}

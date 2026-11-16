import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbExpressionAttributes } from "../sim-dynamodb-expression-attributes.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { SimDynamoDbBeginsWithKeyTerm } from "./sim-dynamodb-begins-with-key-term.js";
import { SimDynamoDbBetweenKeyTerm } from "./sim-dynamodb-between-key-term.js";
import { SimDynamoDbComparisonKeyTerm } from "./sim-dynamodb-comparison-key-term.js";
import { SimDynamoDbKeyConditionOperands } from "./sim-dynamodb-key-condition-operands.js";
import { SimDynamoDbKeyConditionRefusals } from "./sim-dynamodb-key-condition-refusals.js";
import type { SimDynamoDbKeyConditionTerm } from "./sim-dynamodb-key-condition-term.js";

interface SimDynamoDbKeyConditionParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly attributes: SimDynamoDbExpressionAttributes;
  readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
}

/**
 * Reads a KeyConditionExpression into the terms it is made of.
 *
 * This is deliberately not the general condition grammar. A key condition is
 * one equality on the partition key, optionally joined by AND to one sort key
 * condition, and nothing else. Sharing the condition parser would let a query
 * accept `OR`, which real DynamoDB refuses, and that is the kind of divergence
 * that passes here and fails on deploy.
 *
 * Brackets are read, and group nothing that could mean anything else.
 *
 * Which attribute is the partition key and which is the sort key is not known
 * here, since that is a property of the table rather than of the expression.
 * This reads the terms, and `SimDynamoDbKeyConditionTerms` holds them to the
 * key schema once the table has been reached.
 */
export class SimDynamoDbKeyConditionParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly refusals: SimDynamoDbKeyConditionRefusals;
  private readonly operands: SimDynamoDbKeyConditionOperands;

  constructor(properties: SimDynamoDbKeyConditionParserProperties) {
    const refusals = new SimDynamoDbKeyConditionRefusals(properties.tokens);

    this.tokens = properties.tokens;
    this.refusals = refusals;
    this.operands = new SimDynamoDbKeyConditionOperands({
      tokens: properties.tokens,
      attributes: properties.attributes,
      values: properties.values,
      refusals,
    });
  }

  /**
   * Read the whole expression, refusing anything left over after it.
   */
  parse(): readonly SimDynamoDbKeyConditionTerm[] {
    const terms = this.conjunction();

    this.refusals.assertNothingFollows();

    return terms;
  }

  /**
   * Read terms joined by AND.
   *
   * Brackets group terms without changing what they mean, since AND is the
   * only operator a key condition has. Real DynamoDB accepts
   * `(customerId = :c) AND (orderId > :o)`, so a group is read and its terms
   * taken into the conjunction around it. How many terms there are, and which
   * key each tests, is checked against the key schema afterwards, the same way
   * whatever the brackets.
   */
  private conjunction(): readonly SimDynamoDbKeyConditionTerm[] {
    const terms = [...this.grouped()];

    while (this.tokens.takeKeyword("AND")) {
      terms.push(...this.grouped());
    }

    return terms;
  }

  /**
   * Read a bracketed conjunction, or one term.
   */
  private grouped(): readonly SimDynamoDbKeyConditionTerm[] {
    if (!this.tokens.takeSymbol("(")) {
      return [this.term()];
    }

    const terms = this.conjunction();

    this.refusals.assertNoLogicalOperator();
    this.tokens.expectSymbol(
      ")",
      "a bracket opened in the key condition is never closed",
    );

    return terms;
  }

  /**
   * Read one term, which is either a prefix call or a key attribute put
   * against one or two values.
   */
  private term(): SimDynamoDbKeyConditionTerm {
    this.refusals.assertNoLogicalOperator();

    if (this.refusals.takesBeginsWith()) {
      return SimDynamoDbBeginsWithKeyTerm.read({
        tokens: this.tokens,
        operands: this.operands,
      });
    }

    return this.comparison();
  }

  /**
   * Read a key attribute put against one value, or between two of them.
   */
  private comparison(): SimDynamoDbKeyConditionTerm {
    const attributeName = this.operands.attributeName();

    if (this.tokens.takeKeyword("BETWEEN")) {
      return this.between(attributeName);
    }

    return new SimDynamoDbComparisonKeyTerm({
      attributeName,
      operator: this.operands.comparator(),
      value: this.operands.value(),
    });
  }

  /**
   * Read `sortKey BETWEEN :lower AND :upper`.
   *
   * The AND here belongs to BETWEEN rather than joining two terms, which is why
   * the range is read inside a term rather than beside one.
   */
  private between(attributeName: string): SimDynamoDbKeyConditionTerm {
    const lower = this.operands.value();
    this.tokens.expectKeyword("AND");

    return new SimDynamoDbBetweenKeyTerm({
      attributeName,
      lower,
      upper: this.operands.value(),
    });
  }
}

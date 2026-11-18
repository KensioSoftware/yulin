import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbAttributeDefinitions } from "../../table/sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "../../table/sim-dynamodb-key-schema.js";
import { SimDynamoDbKeyCondition } from "./sim-dynamodb-key-condition.js";
import { simDynamoDbKeyConditionError } from "./sim-dynamodb-key-condition-error.js";
import { SimDynamoDbComparisonKeyTerm } from "./sim-dynamodb-comparison-key-term.js";
import type { SimDynamoDbKeyConditionTerm } from "./sim-dynamodb-key-condition-term.js";
import { readSimDynamoDbSortKeyTerms } from "./sim-dynamodb-sort-key-terms.js";

/**
 * What a key condition needs to know about the table it names.
 */
export interface SimDynamoDbKeyConditionTable {
  readonly keySchema: SimDynamoDbKeySchema;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
}

/**
 * The terms one KeyConditionExpression was written as.
 *
 * The expression is read before the table is reached, so that a request real
 * DynamoDB would refuse is refused whether or not the table exists. Which
 * attribute is the partition key is a property of the table, so the rules that
 * need it are applied here rather than in the parser, once the table is known.
 */
export class SimDynamoDbKeyConditionTerms {
  private readonly terms: readonly SimDynamoDbKeyConditionTerm[];

  constructor(terms: readonly SimDynamoDbKeyConditionTerm[]) {
    this.terms = terms;
  }

  /**
   * Read these terms against the key schema of the table the request names.
   */
  forTable(table: SimDynamoDbKeyConditionTable): SimDynamoDbKeyCondition {
    const { keySchema, attributeDefinitions } = table;

    this.assertNameKeyAttributes(keySchema);

    return new SimDynamoDbKeyCondition({
      partitionKey: new Map(
        keySchema.partitionKeyAttributeNames.map((attributeName) => [
          attributeName,
          this.partitionKeyValue(attributeName, attributeDefinitions),
        ]),
      ),
      sortKeyTerms: readSimDynamoDbSortKeyTerms(
        keySchema.sortKeyAttributeNames.map((attributeName) => {
          const term = this.single(attributeName);

          term?.assertUsableOn(attributeDefinitions.typeOf(attributeName));

          return { attributeName, term };
        }),
      ),
    });
  }

  /**
   * Refuse a term naming anything but a key attribute.
   *
   * A query walks the primary key, so an attribute outside it has nothing to
   * walk. Real DynamoDB refuses it rather than filtering by it, which is what
   * `FilterExpression` is for.
   */
  private assertNameKeyAttributes(keySchema: SimDynamoDbKeySchema): void {
    const keyNames = keySchema.attributeNames();

    for (const term of this.terms) {
      if (!keyNames.includes(term.attributeName)) {
        throw simDynamoDbKeyConditionError(
          `${term.attributeName} is not part of the table's primary key, and ` +
            `a key condition names only key attributes`,
        );
      }
    }
  }

  /**
   * The value one partition key attribute is held equal to.
   *
   * A query reads one item collection, so every partition key attribute is
   * named, and named by equality.
   */
  private partitionKeyValue(
    attributeName: string,
    attributeDefinitions: SimDynamoDbAttributeDefinitions,
  ): SimDynamoDbValue {
    const term = this.single(attributeName);

    if (term === undefined) {
      throw simDynamoDbKeyConditionError(
        `the key condition does not name the partition key ${attributeName}, ` +
          `and a query reads one item collection`,
      );
    }

    if (!(term instanceof SimDynamoDbComparisonKeyTerm)) {
      throw this.partitionKeyOperatorError(attributeName, term.operator);
    }

    if (term.operator !== "=") {
      throw this.partitionKeyOperatorError(attributeName, term.operator);
    }

    // The partition key is held to its declared type the same way the sort key
    // is. A value of another type names an item collection that cannot exist.
    term.assertUsableOn(attributeDefinitions.typeOf(attributeName));

    return term.value;
  }

  /**
   * The one term naming an attribute, refusing an expression naming it twice.
   */
  private single(
    attributeName: string,
  ): SimDynamoDbKeyConditionTerm | undefined {
    const found = this.terms.filter(
      (term) => term.attributeName === attributeName,
    );

    if (found.length > 1) {
      throw simDynamoDbKeyConditionError(
        `the key condition tests ${attributeName} more than once`,
      );
    }

    return found.at(0);
  }

  /**
   * Build the refusal for a range operator applied to the partition key.
   */
  private partitionKeyOperatorError(
    attributeName: string,
    operator: string,
  ): Error {
    return simDynamoDbKeyConditionError(
      `the partition key ${attributeName} takes only =, and ${operator} was ` +
        `given: a query reads one item collection rather than a range of them`,
    );
  }
}

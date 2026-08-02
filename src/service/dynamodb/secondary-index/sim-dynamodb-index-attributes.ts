import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbDocumentPath } from "../expression/sim-dynamodb-document-path.js";
import { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbIndexProjection } from "./sim-dynamodb-index-projection.js";

interface SimDynamoDbIndexAttributesProperties {
  readonly indexName: string;
  readonly projection: SimDynamoDbIndexProjection;
  readonly keyAttributeNames: ReadonlySet<string>;
}

/**
 * Which attributes one index carries, and what it refuses for not carrying.
 *
 * An index entry is keyed by the index key and identified by the table key, so
 * both are in every item it holds and both come back whatever it projects. The
 * projection says what else does.
 *
 * This is separate from the index view because it is about attributes rather
 * than items: nothing here knows which items the index holds, or in what order.
 */
export class SimDynamoDbIndexAttributes {
  private readonly indexName: string;
  private readonly projection: SimDynamoDbIndexProjection;
  private readonly keyAttributeNames: ReadonlySet<string>;

  constructor(properties: SimDynamoDbIndexAttributesProperties) {
    this.indexName = properties.indexName;
    this.projection = properties.projection;
    this.keyAttributeNames = properties.keyAttributeNames;
  }

  /**
   * Cut an item down to the attributes the index carries.
   */
  project(item: SimDynamoDbItem): SimDynamoDbItem {
    if (this.projection.carriesWholeItem) {
      return item;
    }

    return SimDynamoDbItem.ofAttributes(
      new Map(
        item
          .entries()
          .entries()
          .filter(([name]) => this.carries(name)),
      ),
    );
  }

  /**
   * Refuse a read asking for whole items from a projection holding part of one.
   *
   * Real DynamoDB reads the table for each item to answer this, at a cost the
   * request did not ask for, so it refuses it on an index that projects less
   * than everything.
   */
  assertCarriesWholeItem(): void {
    if (this.projection.carriesWholeItem) {
      return;
    }

    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Select type ALL_ATTRIBUTES ` +
        `is not supported for global secondary index ${this.indexName} ` +
        `because its projection type is not ALL`,
    );
  }

  /**
   * Refuse an expression naming an attribute the index does not project.
   */
  assertCarriesPaths(paths: readonly SimDynamoDbDocumentPath[]): void {
    if (this.projection.carriesWholeItem) {
      return;
    }

    const carried = [
      ...this.keyAttributeNames,
      ...this.projection.addedAttributeNames,
    ];

    for (const path of paths) {
      if (carried.every((name) => !path.startsAt(name))) {
        throw new SimDynamoDbValidationException(
          `${path.text} is not projected into the global secondary index ` +
            `${this.indexName}, and a read of an index names only the ` +
            `attributes it projects`,
        );
      }
    }
  }

  /**
   * Whether the index carries one attribute of the items it holds.
   */
  private carries(attributeName: string): boolean {
    return (
      this.keyAttributeNames.has(attributeName) ||
      this.projection.adds(attributeName)
    );
  }
}

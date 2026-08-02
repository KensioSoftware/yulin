import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbDocumentPath } from "../expression/sim-dynamodb-document-path.js";
import { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type {
  SimDynamoDbIndexAttributes,
  SimDynamoDbIndexAttributesProperties,
} from "./sim-dynamodb-index-attributes.js";
import type { SimDynamoDbIndexProjection } from "./sim-dynamodb-index-projection.js";

/**
 * The attributes a global secondary index carries, and nothing else.
 *
 * A global secondary index is a copy of the table held apart from it, so a read
 * of one never reaches the table. Anything the index does not project is not
 * there to answer with, which is why asking for it is refused rather than
 * served.
 */
export class SimDynamoDbProjectedIndexAttributes implements SimDynamoDbIndexAttributes {
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

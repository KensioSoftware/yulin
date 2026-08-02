import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type {
  SimDynamoDbIndexAttributes,
  SimDynamoDbIndexAttributesProperties,
} from "./sim-dynamodb-index-attributes.js";
import { SimDynamoDbProjectedIndexAttributes } from "./sim-dynamodb-projected-index-attributes.js";

/**
 * The attributes a local secondary index carries, plus the base table's.
 *
 * A local secondary index entry sits in the same partition as the item it
 * indexes, so DynamoDB can read that item while it walks the index. An
 * attribute the index does not project is therefore fetched rather than
 * refused, which is the fetch the extra read capacity is charged for.
 *
 * The projection still decides what a read answers with by default, so cutting
 * an item down is the same job it is on a global secondary index and is left to
 * that class. What differs is that nothing here refuses a read for asking
 * beyond the projection.
 */
export class SimDynamoDbFetchedIndexAttributes implements SimDynamoDbIndexAttributes {
  private readonly projected: SimDynamoDbProjectedIndexAttributes;

  constructor(properties: SimDynamoDbIndexAttributesProperties) {
    this.projected = new SimDynamoDbProjectedIndexAttributes(properties);
  }

  /**
   * Cut an item down to the attributes the index projects.
   *
   * This is what a read answers with unless it asked for whole items, since
   * `ALL_PROJECTED_ATTRIBUTES` is what a read of any index defaults to.
   */
  project(item: SimDynamoDbItem): SimDynamoDbItem {
    return this.projected.project(item);
  }

  /**
   * Whole items are answerable from any projection, since the table is there.
   */
  assertCarriesWholeItem(): void {
    return;
  }

  /**
   * Any attribute is nameable, since one outside the projection is fetched.
   */
  assertCarriesPaths(): void {
    return;
  }
}

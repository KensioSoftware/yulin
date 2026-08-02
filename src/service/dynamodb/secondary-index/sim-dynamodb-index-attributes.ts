import type { SimDynamoDbDocumentPath } from "../expression/sim-dynamodb-document-path.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbIndexProjection } from "./sim-dynamodb-index-projection.js";

/**
 * Which attributes one index carries, and what it refuses for not carrying.
 *
 * An index entry is keyed by the index key and identified by the table key, so
 * both are in every item it holds and both come back whatever it projects. The
 * projection says what else does.
 *
 * This is where the two index kinds part company, and it is the only place a
 * read of one differs from a read of the other. A global secondary index is a
 * copy of the table held apart from it, so it can only answer with what it
 * projects and a read asking for more is refused. A local secondary index sits
 * in the same partition as the item it indexes, so DynamoDB reads the base
 * table for an attribute the index does not project, and charges the extra
 * read capacity for it.
 *
 * This is separate from the index view because it is about attributes rather
 * than items: nothing here knows which items the index holds, or in what order.
 */
export interface SimDynamoDbIndexAttributes {
  /**
   * Cut an item down to the attributes the index carries.
   */
  project(item: SimDynamoDbItem): SimDynamoDbItem;

  /**
   * Refuse a read asking for whole items where the index holds part of one.
   */
  assertCarriesWholeItem(): void;

  /**
   * Refuse an expression naming an attribute the index does not project.
   */
  assertCarriesPaths(paths: readonly SimDynamoDbDocumentPath[]): void;
}

/**
 * What either kind of index attributes is built from.
 */
export interface SimDynamoDbIndexAttributesProperties {
  readonly indexName: string;
  readonly projection: SimDynamoDbIndexProjection;
  readonly keyAttributeNames: ReadonlySet<string>;
}

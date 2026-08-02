import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type { SimDynamoDbKeyCondition } from "../expression/key-condition/sim-dynamodb-key-condition.js";
import type { SimDynamoDbDocumentPath } from "../expression/sim-dynamodb-document-path.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbItemCollection } from "./sim-dynamodb-item-collection.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import type { SimDynamoDbTableScan } from "./sim-dynamodb-table-scan.js";

/**
 * What a Query or a Scan reads: a table, or one of its secondary indexes.
 *
 * The two answer the same questions and answer them differently, which is the
 * whole of what `IndexName` does to a read. A table view holds every item and
 * every attribute of it. An index view holds the items carrying the index key,
 * keyed by that key, and only the attributes the index projects.
 *
 * A view is built per read rather than kept, since an index is derived when it
 * is looked at rather than maintained on the write path.
 */
export interface SimDynamoDbReadView {
  /**
   * How a refusal names what is being read.
   */
  readonly description: string;

  /**
   * The key a read of this walks by, which for an index is its own.
   */
  readonly keySchema: SimDynamoDbKeySchema;

  /**
   * The types the key attributes were declared with, which the table owns
   * whichever view uses them.
   */
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;

  /**
   * The items one key condition names, in sort key order.
   */
  itemCollection(
    keyCondition: SimDynamoDbKeyCondition,
  ): SimDynamoDbItemCollection;

  /**
   * Every item this view holds, in the order a Scan reads them.
   */
  scan(): SimDynamoDbTableScan;

  /**
   * Refuse an `ExclusiveStartKey` this view could not have handed out.
   */
  assertStartKey(key: SimDynamoDbItem): void;

  /**
   * The key attributes a pagination token carries for this view.
   */
  tokenKey(item: SimDynamoDbItem): Record<string, SimDynamoDbAttributeValue>;

  /**
   * Cut an item down to what this view carries.
   */
  project(item: SimDynamoDbItem): SimDynamoDbItem;

  /**
   * Refuse a read asking for whole items where this view holds part of them.
   */
  assertCarriesWholeItem(): void;

  /**
   * Refuse an expression naming an attribute this view does not carry.
   *
   * A path into an attribute an index does not project would match nothing
   * here, which reads as a collection that happens to be empty. Real DynamoDB
   * refuses it, so this does too rather than answering with a page that means
   * something else.
   */
  assertCarriesPaths(paths: readonly SimDynamoDbDocumentPath[]): void;

  /**
   * Refuse a strongly consistent read this view cannot answer.
   *
   * Only a global secondary index refuses one. It is maintained asynchronously
   * on AWS, so it cannot answer a strongly consistent read whatever the
   * simulation does. A table and a local secondary index both can.
   */
  assertConsistentRead(): void;
}

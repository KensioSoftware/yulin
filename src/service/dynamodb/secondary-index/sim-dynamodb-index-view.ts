import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type { SimDynamoDbKeyCondition } from "../expression/key-condition/sim-dynamodb-key-condition.js";
import type { SimDynamoDbDocumentPath } from "../expression/sim-dynamodb-document-path.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbItemCollection } from "../table/sim-dynamodb-item-collection.js";
import type { SimDynamoDbItemKey } from "../table/sim-dynamodb-item-key.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import type { SimDynamoDbReadView } from "../table/sim-dynamodb-read-view.js";
import { SimDynamoDbTableScan } from "../table/sim-dynamodb-table-scan.js";
import { SimDynamoDbSortKeyOrder } from "../table/sim-dynamodb-sort-key-order.js";
import type { SimDynamoDbGlobalSecondaryIndex } from "./sim-dynamodb-global-secondary-index.js";
import { SimDynamoDbIndexAttributes } from "./sim-dynamodb-index-attributes.js";
import { SimDynamoDbIndexKeys } from "./sim-dynamodb-index-keys.js";

interface SimDynamoDbIndexViewProperties {
  readonly index: SimDynamoDbGlobalSecondaryIndex;
  readonly items: readonly SimDynamoDbItem[];
  readonly tableKeySchema: SimDynamoDbKeySchema;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly tableItemKey: SimDynamoDbItemKey;
}

/**
 * Reading one global secondary index.
 *
 * The index is worked out here rather than maintained on the write path, which
 * is what makes an index added to a table have nothing to backfill and every
 * item write unaware of it.
 *
 * The two things that make an index narrower than the table are answered by a
 * collaborator each. `SimDynamoDbIndexKeys` is which items it holds and how
 * they are named, and `SimDynamoDbIndexAttributes` is which parts of them come
 * back. What is left here is the walking, which is the same walking a table
 * gets.
 */
export class SimDynamoDbIndexView implements SimDynamoDbReadView {
  public readonly description: string;
  public readonly keySchema: SimDynamoDbKeySchema;
  public readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;

  private readonly items: readonly SimDynamoDbItem[];
  private readonly keys: SimDynamoDbIndexKeys;
  private readonly attributes: SimDynamoDbIndexAttributes;
  private readonly order: SimDynamoDbSortKeyOrder;

  constructor(properties: SimDynamoDbIndexViewProperties) {
    const { index } = properties;

    this.description = `index ${index.name}`;
    this.keySchema = index.keySchema;
    this.attributeDefinitions = properties.attributeDefinitions;
    this.keys = new SimDynamoDbIndexKeys({
      indexName: index.name,
      indexKeySchema: index.keySchema,
      tableKeySchema: properties.tableKeySchema,
      attributeDefinitions: properties.attributeDefinitions,
      tableItemKey: properties.tableItemKey,
    });
    this.attributes = new SimDynamoDbIndexAttributes({
      indexName: index.name,
      projection: index.projection,
      keyAttributeNames: this.keys.attributeNames,
    });

    // Index key values are not unique, so the table key is what separates two
    // entries sharing one and lets a walk resume after either.
    this.order = new SimDynamoDbSortKeyOrder({
      attributeName: index.keySchema.rangeKeyAttributeName,
      identity: properties.tableItemKey,
    });

    this.items = properties.items.filter((item) => this.keys.holds(item));
  }

  /**
   * The entries of the index one key condition names, by the index key.
   */
  itemCollection(
    keyCondition: SimDynamoDbKeyCondition,
  ): SimDynamoDbItemCollection {
    return new SimDynamoDbItemCollection({
      items: this.items,
      keySchema: this.keySchema,
      order: this.order,
      keyCondition,
    });
  }

  /**
   * Every entry the index holds, in the order a Scan reads them.
   */
  scan(): SimDynamoDbTableScan {
    return new SimDynamoDbTableScan({
      items: this.items,
      order: this.order,
      itemKey: this.keys.indexItemKey,
    });
  }

  /**
   * Refuse an `ExclusiveStartKey` this index could not have handed out.
   */
  assertStartKey(key: SimDynamoDbItem): void {
    this.keys.assertStartKey(key);
  }

  /**
   * The index key and the table key of the entry a walk stopped on.
   */
  tokenKey(item: SimDynamoDbItem): Record<string, SimDynamoDbAttributeValue> {
    return this.keys.tokenKey(item);
  }

  /**
   * Cut an item down to the attributes this index carries.
   */
  project(item: SimDynamoDbItem): SimDynamoDbItem {
    return this.attributes.project(item);
  }

  /**
   * Refuse a read asking for whole items from a partial projection.
   */
  assertCarriesWholeItem(): void {
    this.attributes.assertCarriesWholeItem();
  }

  /**
   * Refuse an expression naming an attribute this index does not project.
   */
  assertCarriesPaths(paths: readonly SimDynamoDbDocumentPath[]): void {
    this.attributes.assertCarriesPaths(paths);
  }
}

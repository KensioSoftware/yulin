import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type { SimDynamoDbKeyCondition } from "../expression/key-condition/sim-dynamodb-key-condition.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbItemCollection } from "./sim-dynamodb-item-collection.js";
import type { SimDynamoDbItemKey } from "./sim-dynamodb-item-key.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import { simDynamoDbPrimaryKeyAttributes } from "./sim-dynamodb-primary-key.js";
import type { SimDynamoDbReadView } from "./sim-dynamodb-read-view.js";
import { SimDynamoDbTableScan } from "./sim-dynamodb-table-scan.js";
import { SimDynamoDbSortKeyOrder } from "./sim-dynamodb-sort-key-order.js";

interface SimDynamoDbTableViewProperties {
  readonly tableName: string;
  readonly items: readonly SimDynamoDbItem[];
  readonly keySchema: SimDynamoDbKeySchema;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly itemKey: SimDynamoDbItemKey;
}

/**
 * Reading the table itself, rather than one of its indexes.
 *
 * This is the view a request naming no `IndexName` gets, and it holds
 * everything: every item the table has, keyed by the table's own primary key,
 * with every attribute of each. So the questions an index answers narrowly all
 * have the wide answer here.
 */
export class SimDynamoDbTableView implements SimDynamoDbReadView {
  public readonly description: string;
  public readonly keySchema: SimDynamoDbKeySchema;
  public readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;

  private readonly items: readonly SimDynamoDbItem[];
  private readonly itemKey: SimDynamoDbItemKey;
  private readonly order: SimDynamoDbSortKeyOrder;

  constructor(properties: SimDynamoDbTableViewProperties) {
    this.description = `table ${properties.tableName}`;
    this.keySchema = properties.keySchema;
    this.attributeDefinitions = properties.attributeDefinitions;
    this.items = properties.items;
    this.itemKey = properties.itemKey;
    // A table primary key is unique, so the sort key settles every order
    // question and nothing has to separate two items sharing one.
    this.order = new SimDynamoDbSortKeyOrder({
      attributeName: properties.keySchema.rangeKeyAttributeName,
    });
  }

  /**
   * The items of the table one key condition names.
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
   * Every item the table holds, in the order a Scan reads them.
   */
  scan(): SimDynamoDbTableScan {
    return new SimDynamoDbTableScan({
      items: this.items,
      order: this.order,
      itemKey: this.itemKey,
    });
  }

  /**
   * Refuse a token that is not a whole primary key of this table.
   */
  assertStartKey(key: SimDynamoDbItem): void {
    this.itemKey.ofKey(key);
  }

  /**
   * The primary key of the item a walk stopped on.
   */
  tokenKey(item: SimDynamoDbItem): Record<string, SimDynamoDbAttributeValue> {
    return simDynamoDbPrimaryKeyAttributes(item, this.keySchema);
  }

  /**
   * A table read answers with the whole item, so there is nothing to cut.
   */
  project(item: SimDynamoDbItem): SimDynamoDbItem {
    return item;
  }

  /**
   * A table read already answers with whole items, so nothing is refused.
   */
  assertCarriesWholeItem(): void {
    return;
  }

  /**
   * A filter may name any attribute of a table, so nothing is refused.
   */
  assertCarriesPaths(): void {
    return;
  }
}

import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbSecondaryIndexes } from "../secondary-index/sim-dynamodb-secondary-indexes.js";
import type { SimDynamoDbTableStream } from "../stream/sim-dynamodb-table-stream.js";
import { SimDynamoDbTableTimeToLive } from "../time-to-live/sim-dynamodb-table-time-to-live.js";
import type { SimDynamoDbReadView } from "./sim-dynamodb-read-view.js";
import type { SimDynamoDbTableDefinition } from "./sim-dynamodb-table-definition.js";
import { SimDynamoDbTableItems } from "./sim-dynamodb-table-items.js";
import { simDynamoDbTableReadView } from "./sim-dynamodb-table-read-view.js";
import { SimDynamoDbTableWrites } from "./sim-dynamodb-table-writes.js";
import type { DynamoDbTableName } from "./sim-dynamodb-table-name.js";

interface SimDynamoDbTableStorageProperties {
  readonly tableName: DynamoDbTableName;
  readonly definition: SimDynamoDbTableDefinition;
  readonly indexes: SimDynamoDbSecondaryIndexes;
  readonly stream: SimDynamoDbTableStream;
  readonly background: BackgroundScheduler;
}

/**
 * What one simulated table holds, and everything that reaches its items.
 *
 * The items, the key they are held under, the writes that put them there and
 * the time to live that takes them away are all one thing, because none of them
 * is any use without the others: a key is read to write an item, and a write is
 * what gives an item its deletion window. Holding them together is what leaves
 * the table itself as what a request asks about rather than where its items
 * live.
 *
 * This is built from a definition rather than from a key schema, so the key an
 * item is stored under follows an UpdateTable that changed which attributes the
 * table declares, without the storage having to be told about the update.
 *
 * The stream is handed in rather than made here, because it outlives the
 * items: a table's stream is switched on and off by UpdateTable and keeps what
 * it captured, where the storage is only ever what the table holds now.
 */
export class SimDynamoDbTableStorage {
  /**
   * The table's time to live, and the item removals it drives.
   */
  public readonly timeToLive: SimDynamoDbTableTimeToLive;

  /**
   * How the table takes a write, as a check and then a commit, which is what
   * lets a transaction prepare all of its writes before committing any.
   */
  public readonly writes: SimDynamoDbTableWrites;

  private readonly tableName: DynamoDbTableName;
  private readonly definition: SimDynamoDbTableDefinition;
  private readonly indexes: SimDynamoDbSecondaryIndexes;
  private readonly items: SimDynamoDbTableItems;

  constructor(properties: SimDynamoDbTableStorageProperties) {
    this.items = new SimDynamoDbTableItems({ changes: properties.stream });
    this.tableName = properties.tableName;
    this.definition = properties.definition;
    this.indexes = properties.indexes;
    this.timeToLive = new SimDynamoDbTableTimeToLive({
      tableName: properties.tableName,
      items: this.items,
      background: properties.background,
    });
    this.writes = new SimDynamoDbTableWrites({
      items: this.items,
      timeToLive: this.timeToLive,
      definition: properties.definition,
      indexes: properties.indexes,
    });
  }

  /**
   * Put an item into the table, and answer with whatever it replaced. The item
   * is there by the time this returns, since real DynamoDB acknowledges a write
   * once it is durable.
   */
  putItem(item: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.writes.prepareItem(item).commit();
  }

  /**
   * The item already stored under the same primary key as this one.
   *
   * A conditional write is checked against what is there before it, and what is
   * there is found by the key inside the item rather than by a Key of its own.
   * The key is read the same way a write reads it, so an item that could not be
   * written does not quietly find nothing here either.
   */
  itemUnder(item: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.items.get(this.definition.itemKey.of(item));
  }

  /**
   * The primary key an item is stored under, as the table marshals it.
   *
   * A batch write tells two operations on the same item apart by comparing
   * these, which is why the key is readable rather than only usable. Reading it
   * checks the item against the key schema, so a key a write would refuse is
   * refused here too.
   */
  keyOfItem(item: SimDynamoDbItem): string {
    return this.definition.itemKey.of(item);
  }

  /**
   * The primary key a request's Key names, as the table marshals it.
   */
  keyOfKey(key: SimDynamoDbItem): string {
    return this.definition.itemKey.ofKey(key);
  }

  /**
   * Read the item a primary key names, if the table holds one.
   *
   * Every write has landed by the time it returns, so this reads the latest
   * one. That is what real DynamoDB gives a strongly consistent read.
   */
  getItem(key: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.items.get(this.definition.itemKey.ofKey(key));
  }

  /**
   * Remove the item a primary key names, and answer with whatever was removed.
   */
  deleteItem(key: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.writes.prepareRemoval(key).commit();
  }

  /**
   * What a Query or a Scan reads: the table, or one of its indexes.
   */
  view(indexName: string | undefined): SimDynamoDbReadView {
    return simDynamoDbTableReadView({
      tableName: this.tableName,
      indexName,
      items: this.items.entries().values().toArray(),
      keySchema: this.definition.keySchema,
      attributeDefinitions: this.definition.attributeDefinitions,
      indexes: this.indexes,
      itemKey: this.definition.itemKey,
    });
  }
}

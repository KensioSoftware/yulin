import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbSecondaryIndexes } from "../secondary-index/sim-dynamodb-secondary-indexes.js";
import type { SimDynamoDbTableTimeToLive } from "../time-to-live/sim-dynamodb-table-time-to-live.js";
import type { SimDynamoDbTableDefinition } from "./sim-dynamodb-table-definition.js";
import type { SimDynamoDbTableItems } from "./sim-dynamodb-table-items.js";

/**
 * Where a prepared write lands once it is committed.
 */
interface SimDynamoDbTableStore {
  readonly items: SimDynamoDbTableItems;
  readonly timeToLive: SimDynamoDbTableTimeToLive;
}

interface SimDynamoDbTableWritesProperties extends SimDynamoDbTableStore {
  readonly definition: SimDynamoDbTableDefinition;
  readonly indexes: SimDynamoDbSecondaryIndexes;
}

/**
 * A write to a table that has passed everything it could be refused for.
 *
 * Committing it stores what was prepared and nothing else, so it cannot throw.
 * That is what lets a transaction prepare all of its writes and then apply them
 * knowing none of them will fail part way through.
 */
export interface SimDynamoDbTableWrite {
  /**
   * Make this write, and answer with whatever item it displaced.
   */
  commit(): SimDynamoDbItem | undefined;
}

/**
 * A prepared put, which is an item and the key it goes under.
 */
class SimDynamoDbTableItemWrite implements SimDynamoDbTableWrite {
  private readonly store: SimDynamoDbTableStore;
  private readonly key: string;
  private readonly item: SimDynamoDbItem;

  constructor(
    store: SimDynamoDbTableStore,
    key: string,
    item: SimDynamoDbItem,
  ) {
    this.store = store;
    this.key = key;
    this.item = item;
  }

  commit(): SimDynamoDbItem | undefined {
    const replaced = this.store.items.put(this.key, this.item);

    this.store.timeToLive.scheduleFor(this.key, this.item);

    return replaced;
  }
}

/**
 * A prepared delete, which is the key the item to remove is held under.
 */
class SimDynamoDbTableItemRemoval implements SimDynamoDbTableWrite {
  private readonly store: SimDynamoDbTableStore;
  private readonly key: string;

  constructor(store: SimDynamoDbTableStore, key: string) {
    this.store = store;
    this.key = key;
  }

  commit(): SimDynamoDbItem | undefined {
    return this.store.items.remove(this.key);
  }
}

/**
 * How one table takes a write, in the two steps a transaction needs.
 *
 * Preparing a write does everything that can be refused, and committing it does
 * everything that cannot. Every write in the service goes through both, so a
 * check added to the write path is on the preparing side by construction rather
 * than by anyone remembering to put it there.
 */
export class SimDynamoDbTableWrites {
  private readonly store: SimDynamoDbTableStore;
  private readonly definition: SimDynamoDbTableDefinition;
  private readonly indexes: SimDynamoDbSecondaryIndexes;

  constructor(properties: SimDynamoDbTableWritesProperties) {
    this.store = { items: properties.items, timeToLive: properties.timeToLive };
    this.definition = properties.definition;
    this.indexes = properties.indexes;
  }

  /**
   * Check an item can be written to this table, without writing it.
   */
  prepareItem(item: SimDynamoDbItem): SimDynamoDbTableWrite {
    const key = this.definition.itemKey.of(item);

    // An item need not carry an index's key attributes, since a secondary
    // index of either kind is sparse. Carrying one as a type the index did not
    // declare is refused, since the index could never hold it.
    this.indexes.assertItemKeyTypes(item, this.definition.attributeDefinitions);

    return new SimDynamoDbTableItemWrite(this.store, key, item);
  }

  /**
   * Check a key can be removed from this table, without removing it.
   *
   * A key holding nothing is prepared as readily as one holding an item.
   * DynamoDB deletes by key rather than by item, so removing a key that is
   * already free asks for the state it is already in.
   */
  prepareRemoval(key: SimDynamoDbItem): SimDynamoDbTableWrite {
    return new SimDynamoDbTableItemRemoval(
      this.store,
      this.definition.itemKey.ofKey(key),
    );
  }
}

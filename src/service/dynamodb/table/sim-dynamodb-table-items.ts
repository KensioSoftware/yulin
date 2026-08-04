import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbItemChanges } from "../stream/sim-dynamodb-item-change.js";

interface SimDynamoDbTableItemsProperties {
  readonly changes: SimDynamoDbItemChanges;
}

/**
 * The items one simulated table holds, keyed by marshalled primary key.
 *
 * A write lands before the call that made it returns, so a table is
 * read-your-writes as real DynamoDB is for a strongly consistent read. Nothing
 * here is scheduled: an item that a request has been told was written is an
 * item that is there.
 *
 * This is also where every change to an item is reported from, because it is
 * the one place all of them pass through exactly once: PutItem, UpdateItem,
 * DeleteItem, the batch and transactional writes, and the time to live removal
 * all end up here and nowhere else. The old value is already read to answer
 * with, so reporting the transition costs nothing extra.
 */
export class SimDynamoDbTableItems {
  private readonly items = new Map<string, SimDynamoDbItem>();
  private readonly changes: SimDynamoDbItemChanges;

  constructor(properties: SimDynamoDbTableItemsProperties) {
    this.changes = properties.changes;
  }

  /**
   * Write an item, and answer with whatever it replaced.
   *
   * A write is reported whether or not it changed anything. UpdateItem with no
   * UpdateExpression stores the item that was already there, so the two images
   * arrive here as the same object, and real DynamoDB writes a `MODIFY` record
   * for that request too. Comparing the images to decide would report less than
   * AWS does, so nothing here compares them.
   */
  put(key: string, item: SimDynamoDbItem): SimDynamoDbItem | undefined {
    const replaced = this.items.get(key);

    this.items.set(key, item);
    this.changes.capture({
      oldImage: replaced,
      newImage: item,
      expired: false,
    });

    return replaced;
  }

  /**
   * Read the item held under a key, if there is one.
   */
  get(key: string): SimDynamoDbItem | undefined {
    return this.items.get(key);
  }

  /**
   * Every item held here, with the key it is held under.
   *
   * Switching time to live on has to reach items that were already written, so
   * the items are readable as a whole rather than only one key at a time.
   */
  entries(): ReadonlyMap<string, SimDynamoDbItem> {
    return this.items;
  }

  /**
   * Remove the item held under a key, and answer with whatever was removed.
   *
   * A key holding nothing is not a failure. DynamoDB deletes by key rather than
   * by item, so removing a key that is already free asks for the state it is
   * already in, and nothing happened for a change to be reported about.
   */
  remove(key: string): SimDynamoDbItem | undefined {
    return this.removed(key, false);
  }

  /**
   * Take the item held under a key because its time to live ran out.
   *
   * This is a removal by DynamoDB itself rather than by the application, which
   * is the one thing about a change that cannot be worked out from the images.
   * It is a separate call rather than a flag on `remove` so that a caller has
   * to decide which it is making.
   */
  expire(key: string): SimDynamoDbItem | undefined {
    return this.removed(key, true);
  }

  /**
   * Take the item held under a key, however it came to be taken.
   */
  private removed(key: string, expired: boolean): SimDynamoDbItem | undefined {
    const removed = this.items.get(key);

    this.items.delete(key);

    if (removed !== undefined) {
      this.changes.capture({
        oldImage: removed,
        newImage: undefined,
        expired,
      });
    }

    return removed;
  }
}

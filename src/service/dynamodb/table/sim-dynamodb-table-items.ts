import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";

/**
 * The items one simulated table holds, keyed by marshalled primary key.
 *
 * A write lands before the call that made it returns, so a table is
 * read-your-writes as real DynamoDB is for a strongly consistent read. Nothing
 * here is scheduled: an item that a request has been told was written is an
 * item that is there.
 */
export class SimDynamoDbTableItems {
  private readonly items = new Map<string, SimDynamoDbItem>();

  /**
   * Write an item, and answer with whatever it replaced.
   */
  put(key: string, item: SimDynamoDbItem): SimDynamoDbItem | undefined {
    const replaced = this.items.get(key);

    this.items.set(key, item);

    return replaced;
  }

  /**
   * Read the item held under a key, if there is one.
   */
  get(key: string): SimDynamoDbItem | undefined {
    return this.items.get(key);
  }

  /**
   * Remove the item held under a key, and answer with whatever was removed.
   *
   * A key holding nothing is not a failure. DynamoDB deletes by key rather than
   * by item, so removing a key that is already free asks for the state it is
   * already in.
   */
  remove(key: string): SimDynamoDbItem | undefined {
    const removed = this.items.get(key);

    this.items.delete(key);

    return removed;
  }
}

import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { DynamoDbItem } from "../item/dynamodb-item.js";

/**
 * The items one simulated table holds, keyed by primary key.
 *
 * A write is scheduled rather than applied at once, so a test sees the same
 * ordering of an item write against other simulated work that it would see on
 * AWS.
 */
export class SimDynamoDbTableItems {
  private readonly items = new Map<string, DynamoDbItem>();
  private readonly background: BackgroundScheduler;

  constructor(background: BackgroundScheduler) {
    this.background = background;
  }

  /**
   * Write an item, replacing whatever was under the same primary key.
   */
  put(key: string, item: DynamoDbItem): void {
    this.background.schedule(() => {
      this.items.set(key, item);
      return Promise.resolve();
    });
  }
}

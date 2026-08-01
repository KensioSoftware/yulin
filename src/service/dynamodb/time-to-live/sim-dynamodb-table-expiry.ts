import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbTableItems } from "../table/sim-dynamodb-table-items.js";
import { simDynamoDbItemDeletionInstant } from "./sim-dynamodb-item-expiry.js";
import type { SimDynamoDbTimeToLive } from "./sim-dynamodb-time-to-live.js";

interface SimDynamoDbTableExpiryProperties {
  readonly items: SimDynamoDbTableItems;
  readonly timeToLive: SimDynamoDbTimeToLive;
  readonly background: BackgroundScheduler;
}

/**
 * Removes a table's items once their time to live has run out.
 *
 * The removal is scheduled on the simulation's clock rather than the host's, so
 * moving simulated time past an item's deletion window is what takes it away.
 * That is what lets one `advanceBy` expire a table's sessions alongside
 * whatever else the same advance causes elsewhere in the simulation, rather
 * than the test having to ask for the expiry separately.
 */
export class SimDynamoDbTableExpiry {
  private readonly items: SimDynamoDbTableItems;
  private readonly timeToLive: SimDynamoDbTimeToLive;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimDynamoDbTableExpiryProperties) {
    this.items = properties.items;
    this.timeToLive = properties.timeToLive;
    this.background = properties.background;
  }

  /**
   * Arrange for an item to be gone once its deletion window runs out.
   *
   * An item whose window has already passed is scheduled for an instant behind
   * the clock, which nothing dispatches until the clock next moves. So a read
   * straight after writing an already expired item still finds it, as it would
   * on AWS.
   *
   * The five year eligibility rule is read against the time of the write, which
   * is when real DynamoDB would first look at the item.
   */
  scheduleFor(key: string, item: SimDynamoDbItem): void {
    const attributeName = this.timeToLive.enabledAttributeName();

    if (attributeName === undefined) {
      return;
    }

    const at = simDynamoDbItemDeletionInstant(
      item,
      attributeName,
      this.background.now(),
    );

    if (at === undefined) {
      return;
    }

    this.background.scheduleAt(at, (): Promise<void> => {
      this.removeIfExpired(key);

      return Promise.resolve();
    });
  }

  /**
   * Arrange for every item already on the table to expire.
   *
   * Switching time to live on gives meaning to TTL attributes that were inert
   * while it was off, so the items that already carry one are scheduled too.
   */
  scheduleForAll(): void {
    for (const [key, item] of this.items.entries()) {
      this.scheduleFor(key, item);
    }
  }

  /**
   * Remove an item, if it is still the expired item that was scheduled.
   *
   * The deletion instant is worked out again from whatever is under the key
   * now, against the time to live the table has now. One re-check covers
   * everything that should call the removal off: the item was deleted,
   * overwritten with a later TTL, or had its TTL attribute removed or changed
   * to something that is not a Number, or time to live was switched off.
   */
  private removeIfExpired(key: string): void {
    const attributeName = this.timeToLive.enabledAttributeName();

    if (attributeName === undefined) {
      return;
    }

    const item = this.items.get(key);

    if (item === undefined) {
      return;
    }

    const now = this.background.now();
    const at = simDynamoDbItemDeletionInstant(item, attributeName, now);

    if (at === undefined || at.getTime() > now.getTime()) {
      return;
    }

    this.items.remove(key);
  }
}

import type { SimPersonalizeRecordedEvent } from "./sim-personalize-recorded-event.js";
import type { SimPersonalizeRecordedItem } from "./sim-personalize-recorded-item.js";
import type { SimPersonalizeRecordedUser } from "./sim-personalize-recorded-user.js";

/**
 * Everything the events API of one simulated Personalize scope has been sent.
 *
 * The three lists are kept apart because the three operations are. An
 * interaction, a catalogue item and a user go to different datasets on real
 * Personalize, and a test asserting on one of them should find only that one.
 *
 * Each list keeps its records in arrival order, and a batch keeps the order
 * the request listed it in. Nothing is ever discarded. A real account offers
 * no way to read any of this back, which is why a test needs it here.
 */
export class SimPersonalizeEventRecords {
  readonly #events: SimPersonalizeRecordedEvent[] = [];
  readonly #items: SimPersonalizeRecordedItem[] = [];
  readonly #users: SimPersonalizeRecordedUser[] = [];

  /** Every interaction this scope has accepted, oldest first. */
  get events(): readonly SimPersonalizeRecordedEvent[] {
    return [...this.#events];
  }

  /** Every item this scope has accepted, oldest first. */
  get items(): readonly SimPersonalizeRecordedItem[] {
    return [...this.#items];
  }

  /** Every user this scope has accepted, oldest first. */
  get users(): readonly SimPersonalizeRecordedUser[] {
    return [...this.#users];
  }

  /** Keep the interactions of one PutEvents, in the order it listed them. */
  addEvents(events: readonly SimPersonalizeRecordedEvent[]): void {
    this.#events.push(...events);
  }

  /** Keep the items of one PutItems, in the order it listed them. */
  addItems(items: readonly SimPersonalizeRecordedItem[]): void {
    this.#items.push(...items);
  }

  /** Keep the users of one PutUsers, in the order it listed them. */
  addUsers(users: readonly SimPersonalizeRecordedUser[]): void {
    this.#users.push(...users);
  }
}

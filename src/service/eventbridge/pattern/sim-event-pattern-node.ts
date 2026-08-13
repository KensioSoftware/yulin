import { isRecord } from "../../../util/type-guard/record.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimEventPatternField } from "./sim-event-pattern-field.js";
import {
  eventPatternRefusal,
  unsimulatedOperatorRefusal,
} from "./sim-event-pattern-refusals.js";

/**
 * The key real EventBridge matches several fields with, one of which is enough.
 *
 * It appears where a field name would, rather than inside a condition list, so
 * it is refused here rather than by the operator table.
 */
const orKey = "$or";

/**
 * What a pattern says about one key: conditions on its value, or a pattern for
 * the object it holds.
 */
type SimEventPatternEntry = SimEventPatternField | SimEventPatternNode;

/**
 * One object in a pattern, and the keys it puts conditions on.
 *
 * A pattern has the same shape as the events it matches, so a nested object in
 * the pattern is a pattern for the nested object in the event. Every key has
 * to match, and the event may carry keys the pattern says nothing about.
 */
export class SimEventPatternNode {
  private readonly entries: ReadonlyMap<string, SimEventPatternEntry>;

  private constructor(entries: ReadonlyMap<string, SimEventPatternEntry>) {
    this.entries = entries;
  }

  /**
   * Read one object of a pattern.
   */
  static of(written: Record<string, JSONValue>): SimEventPatternNode {
    const writtenEntries = Object.entries(written);

    if (writtenEntries.length === 0) {
      throw eventPatternRefusal(
        "a pattern object puts no conditions on anything",
      );
    }

    const entries = new Map<string, SimEventPatternEntry>();

    for (const [key, value] of writtenEntries) {
      entries.set(key, this.entryFor(key, value));
    }

    return new this(entries);
  }

  /**
   * Whether one key of the pattern holds for the object the event carries.
   */
  private static holds(
    entry: SimEventPatternEntry,
    carried: ReadonlyMap<string, unknown>,
    key: string,
  ): boolean {
    if (!carried.has(key)) {
      return entry instanceof SimEventPatternField && entry.matchesAbsent();
    }

    return entry.matches(carried.get(key) ?? null);
  }

  /**
   * Read what a pattern says about one key.
   */
  private static entryFor(
    key: string,
    written: JSONValue,
  ): SimEventPatternEntry {
    if (key === orKey) {
      throw unsimulatedOperatorRefusal(orKey);
    }

    if (Array.isArray(written)) {
      return SimEventPatternField.of(written, key);
    }

    if (isRecord(written)) {
      return this.of(written);
    }

    throw eventPatternRefusal(
      `${key} is written as ${JSON.stringify(written)}, and a pattern key ` +
        `takes either a list of match conditions or a nested pattern object`,
    );
  }

  /**
   * Whether an event value satisfies every key of this pattern object.
   *
   * A value that is not an object satisfies nothing, since there is nothing to
   * read the keys out of.
   */
  matches(value: unknown): boolean {
    if (!isRecord(value)) {
      return false;
    }

    // Read into a Map so a key the event does not have is told apart from one
    // it carries as undefined, without indexing the object by a key the
    // pattern supplied.
    const carried = new Map(Object.entries(value));

    return this.entries
      .entries()
      .every(([key, entry]) => SimEventPatternNode.holds(entry, carried, key));
  }
}

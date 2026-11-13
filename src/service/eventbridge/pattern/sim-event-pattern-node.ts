import { isRecord } from "../../../util/type-guard/record.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimEventPatternField } from "./sim-event-pattern-field.js";
import { eventPatternRefusal } from "./sim-event-pattern-refusals.js";

/**
 * The key real EventBridge matches several fields with, one of which is enough.
 *
 * It appears where a field name would, rather than inside a condition list,
 * and holds a list of patterns for the same object, any one of which is enough.
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
  private readonly alternatives: readonly SimEventPatternNode[];

  private constructor(
    entries: ReadonlyMap<string, SimEventPatternEntry>,
    alternatives: readonly SimEventPatternNode[],
  ) {
    this.entries = entries;
    this.alternatives = alternatives;
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
      if (key !== orKey) {
        entries.set(key, this.entryFor(key, value));
      }
    }

    const alternatives = new Map(writtenEntries).get(orKey);

    return new this(entries, this.alternativesIn(alternatives));
  }

  /**
   * Read the patterns an `$or` offers, any one of which is enough.
   */
  private static alternativesIn(
    written: JSONValue | undefined,
  ): readonly SimEventPatternNode[] {
    if (written === undefined) {
      return [];
    }

    if (!Array.isArray(written) || written.length < 2) {
      throw eventPatternRefusal(
        `${orKey} takes a list of at least two pattern objects, and this one ` +
          `takes ${JSON.stringify(written)}`,
      );
    }

    return written.map((alternative) => this.alternativeIn(alternative));
  }

  /**
   * Read one pattern an `$or` offers, which has to be a pattern object.
   */
  private static alternativeIn(written: JSONValue): SimEventPatternNode {
    if (!isRecord(written)) {
      throw eventPatternRefusal(
        `${orKey} offers ${JSON.stringify(written)}, and each alternative is ` +
          `a pattern object`,
      );
    }

    return this.of(written);
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

    const everyKeyHolds = this.entries
      .entries()
      .every(([key, entry]) => SimEventPatternNode.holds(entry, carried, key));

    return (
      everyKeyHolds &&
      (this.alternatives.length === 0 ||
        this.alternatives.some((alternative) => alternative.matches(value)))
    );
  }
}

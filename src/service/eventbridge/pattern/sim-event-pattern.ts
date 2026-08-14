import { isRecord } from "../../../util/type-guard/record.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimEventBridgeEnvelope } from "../event/sim-event-bridge-event.js";
import { SimEventPatternNode } from "./sim-event-pattern-node.js";
import { eventPatternRefusal } from "./sim-event-pattern-refusals.js";

/**
 * The longest event pattern real EventBridge takes.
 */
const maximumPatternLength = 4096;

/**
 * One rule's event pattern.
 *
 * A pattern has the same shape as the events it matches: a key in the pattern
 * names a field of the event, and a nested object in the pattern is a pattern
 * for the nested object in the event. Every key has to match, so a pattern
 * with more keys matches fewer events.
 *
 * The string it was written as is kept, because DescribeRule reports the
 * pattern back and a caller comparing it against what they sent should see
 * what they sent rather than a re-serialised version of it.
 */
export class SimEventPattern {
  public readonly source: string;

  private readonly root: SimEventPatternNode;

  private constructor(source: string, root: SimEventPatternNode) {
    this.source = source;
    this.root = root;
  }

  /**
   * Read a pattern from the JSON a request carries.
   */
  static of(source: string): SimEventPattern {
    if (source.length > maximumPatternLength) {
      throw eventPatternRefusal(
        `an event pattern is at most ${String(maximumPatternLength)} ` +
          `characters, and this one is ${String(source.length)}`,
      );
    }

    return new this(source, SimEventPatternNode.of(this.parse(source)));
  }

  /**
   * Read the pattern JSON, refusing anything that is not a JSON object.
   */
  private static parse(source: string): Record<string, JSONValue> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(source);
    } catch {
      throw eventPatternRefusal("the event pattern is not valid JSON");
    }

    if (!isRecord(parsed)) {
      throw eventPatternRefusal(
        "an event pattern is a JSON object, shaped like the events it matches",
      );
    }

    return parsed as Record<string, JSONValue>;
  }

  /**
   * Whether an event matches this pattern.
   *
   * An event a bus received arrives as its envelope, and one a caller handed
   * to TestEventPattern arrives as the object their JSON parsed to. Both are
   * read the same way: by key, from the top down.
   */
  matches(event: SimEventBridgeEnvelope | Record<string, unknown>): boolean {
    return this.root.matches(event);
  }
}

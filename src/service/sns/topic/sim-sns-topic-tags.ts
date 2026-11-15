import {
  SimSnsInvalidParameterException,
  SimSnsTagLimitExceededException,
} from "../error/sim-sns.error.js";

const greatestTags = 50;
const greatestKeyLength = 128;
const greatestValueLength = 256;

/**
 * One tag as an SNS request carries it.
 */
export interface SimSnsTagInput {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * The tags one simulated SNS topic holds.
 *
 * Keys and values are case-sensitive. Tagging a key that is already there
 * replaces its value. A topic holds at most 50 tags.
 */
export class SimSnsTopicTags {
  #tags: ReadonlyMap<string, string> = new Map();

  /**
   * Tags read from a request, which may carry none.
   */
  static fromInput(
    input: readonly SimSnsTagInput[] | undefined,
  ): SimSnsTopicTags {
    const tags = new SimSnsTopicTags();

    tags.apply(input ?? []);

    return tags;
  }

  /**
   * Add the tags a request carries, replacing the value of any key already
   * held. A request SNS refuses changes nothing.
   */
  apply(input: readonly SimSnsTagInput[]): void {
    const applied = new Map(this.#tags);

    for (const tag of input) {
      const [key, value] = readTag(tag);

      applied.set(key, value);
    }

    if (applied.size > greatestTags) {
      throw new SimSnsTagLimitExceededException(
        `A topic holds at most ${String(greatestTags)} tags, and this ` +
          `request would leave it holding ${String(applied.size)}`,
      );
    }

    this.#tags = applied;
  }

  /**
   * Take the keys a request names off. A key the topic does not hold is
   * passed over.
   */
  remove(keys: readonly string[]): void {
    this.#tags = new Map(
      this.#tags.entries().filter(([key]) => !keys.includes(key)),
    );
  }

  /**
   * Whether these are exactly the tags another set holds.
   */
  equals(other: SimSnsTopicTags): boolean {
    return (
      this.#tags.size === other.#tags.size &&
      this.#tags
        .entries()
        .every(([key, value]) => other.#tags.get(key) === value)
    );
  }

  /**
   * The tags, value by key.
   */
  record(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#tags);
  }

  /**
   * The tags as SNS lists them.
   */
  list(): { Key: string; Value: string }[] {
    return this.#tags
      .entries()
      .map(([Key, Value]) => ({ Key, Value }))
      .toArray();
  }
}

function readTag(tag: SimSnsTagInput): [string, string] {
  const key = tag.Key ?? "";

  if (key.length === 0 || characters(key) > greatestKeyLength) {
    throw new SimSnsInvalidParameterException(
      `Invalid parameter: Tags Reason: a tag key must be between 1 and ` +
        `${String(greatestKeyLength)} characters long, and ` +
        `${JSON.stringify(key)} is not`,
    );
  }

  const value = tag.Value ?? "";

  if (characters(value) > greatestValueLength) {
    throw new SimSnsInvalidParameterException(
      `Invalid parameter: Tags Reason: the value of tag ` +
        `${JSON.stringify(key)} is longer than ` +
        `${String(greatestValueLength)} characters`,
    );
  }

  return [key, value];
}

/**
 * How many Unicode characters a tag key or value holds. A letter outside the
 * Basic Multilingual Plane is one character and two UTF-16 code units.
 */
function characters(text: string): number {
  let count = 0;

  // A string iterates by code point, where its length counts code units.
  for (const _character of text) {
    count += 1;
  }

  return count;
}

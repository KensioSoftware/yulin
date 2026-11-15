import { SimSqsInvalidParameterValue } from "../error/sim-sqs.error.js";

const greatestKeyLength = 128;
const greatestValueLength = 256;
const reservedPrefix = "aws:";

/**
 * The characters the SQS quotas page allows in a tag key or value. Those are
 * Unicode letters and digits, whitespace, and `_ . : / = + - @`.
 */
const tagCharacters = /^[\p{L}\p{N}\s_.:\/=+\-@]*$/v;

/**
 * The tags one simulated SQS queue holds.
 *
 * Keys and values are case-sensitive. Tagging a key that is already there
 * replaces its value. The quotas page recommends no more than 50 tags on a
 * queue, and enforces no limit, so none is enforced here.
 */
export class SimSqsQueueTags {
  #tags: ReadonlyMap<string, string> = new Map();

  /**
   * Tags read from a request, which may carry none.
   */
  static fromInput(
    input: Readonly<Record<string, string>> | undefined,
  ): SimSqsQueueTags {
    const tags = new SimSqsQueueTags();

    tags.apply(input ?? {});

    return tags;
  }

  /**
   * Add the tags a request carries, replacing the value of any key already
   * held. A request carrying a tag SQS refuses changes nothing.
   */
  apply(input: Readonly<Record<string, string>>): void {
    const entries = Object.entries(input);

    for (const [key, value] of entries) {
      assertTag(key, value);
    }

    this.#tags = new Map([...this.#tags, ...entries]);
  }

  /**
   * Take the keys a request names off. A key the queue does not hold is
   * passed over.
   */
  remove(keys: readonly string[]): void {
    this.#tags = new Map(
      this.#tags.entries().filter(([key]) => !keys.includes(key)),
    );
  }

  /**
   * The tags, value by key.
   */
  record(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#tags);
  }
}

function assertTag(key: string, value: string): void {
  if (key.length === 0 || characters(key) > greatestKeyLength) {
    throw new SimSqsInvalidParameterValue(
      `Tag key ${JSON.stringify(key)} must be between 1 and ` +
        `${String(greatestKeyLength)} characters long`,
    );
  }

  if (characters(value) > greatestValueLength) {
    throw new SimSqsInvalidParameterValue(
      `The value of tag ${JSON.stringify(key)} must be at most ` +
        `${String(greatestValueLength)} characters long`,
    );
  }

  for (const part of [key, value]) {
    if (part.startsWith(reservedPrefix)) {
      throw new SimSqsInvalidParameterValue(
        `Tag ${JSON.stringify(key)} uses the reserved prefix ${reservedPrefix}`,
      );
    }

    if (!tagCharacters.test(part)) {
      throw new SimSqsInvalidParameterValue(
        `Tag ${JSON.stringify(key)} carries a character SQS does not allow ` +
          "in a tag",
      );
    }
  }
}

/**
 * How many Unicode characters a tag key or value holds, which is what the
 * quotas page counts. A letter outside the Basic Multilingual Plane is one
 * character and two UTF-16 code units.
 */
function characters(text: string): number {
  let count = 0;

  // A string iterates by code point, where its length counts code units.
  for (const _character of text) {
    count += 1;
  }

  return count;
}

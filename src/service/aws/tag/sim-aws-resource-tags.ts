const greatestKeyLength = 128;
const greatestValueLength = 256;
const reservedPrefix = "aws:";

/**
 * The rules one service applies to the tags its resources hold.
 */
export interface SimAwsTagRules {
  /**
   * The most tags one resource holds. A request that would leave it holding
   * more changes nothing.
   */
  readonly greatest: number;

  /**
   * The characters a key or value may hold. A service that documents no
   * pattern leaves this out.
   */
  readonly characters?: RegExp | undefined;

  /**
   * The error a malformed tag raises.
   */
  readonly invalid: (message: string) => Error;

  /**
   * The error a request leaving a resource over its limit raises.
   */
  readonly tooMany: (message: string) => Error;
}

/**
 * The tags one simulated resource holds.
 *
 * Keys and values are case-sensitive. A key holds 1 to 128 Unicode
 * characters and a value up to 256, and a key under the `aws:` prefix is
 * reserved for AWS. Tagging a key that is already there replaces its value.
 */
export class SimAwsResourceTags {
  readonly #rules: SimAwsTagRules;
  #tags: ReadonlyMap<string, string> = new Map();

  constructor(rules: SimAwsTagRules) {
    this.#rules = rules;
  }

  /**
   * Add the tags a request carries, replacing the value of any key already
   * held. A request carrying a tag the service refuses changes nothing.
   */
  apply(tags: Readonly<Record<string, string>>): void {
    const entries = Object.entries(tags);

    for (const [key, value] of entries) {
      this.#assertTag(key, value);
    }

    const applied = new Map([...this.#tags, ...entries]);

    if (applied.size > this.#rules.greatest) {
      throw this.#rules.tooMany(
        `A resource holds at most ${String(this.#rules.greatest)} tags, and ` +
          `this request would leave it holding ${String(applied.size)}`,
      );
    }

    this.#tags = applied;
  }

  /**
   * Take the keys a request names off. A key the resource does not hold is
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

  /**
   * The tags as `Key` and `Value` pairs, in the order they were first set.
   */
  list(): { Key: string; Value: string }[] {
    return this.#tags
      .entries()
      .map(([Key, Value]) => ({ Key, Value }))
      .toArray();
  }

  #assertTag(key: string, value: string): void {
    const { invalid, characters } = this.#rules;

    if (key.length === 0 || length(key) > greatestKeyLength) {
      throw invalid(
        `Tag key ${JSON.stringify(key)} must be between 1 and ` +
          `${String(greatestKeyLength)} characters long`,
      );
    }

    if (length(value) > greatestValueLength) {
      throw invalid(
        `The value of tag ${JSON.stringify(key)} must be at most ` +
          `${String(greatestValueLength)} characters long`,
      );
    }

    if (key.toLowerCase().startsWith(reservedPrefix)) {
      throw invalid(
        `Tag key ${JSON.stringify(key)} uses the prefix ${reservedPrefix}, ` +
          "which is reserved for AWS",
      );
    }

    if (
      characters !== undefined &&
      !(characters.test(key) && characters.test(value))
    ) {
      throw invalid(
        `Tag ${JSON.stringify(key)} carries a character this service does ` +
          "not allow in a tag",
      );
    }
  }
}

/**
 * Tags held as a list of key and value pairs, the shape most AWS APIs take
 * them in, as a value by key. A later pair for the same key wins.
 */
export function simAwsTagPairs(
  tags: readonly (readonly [string | undefined, string | undefined])[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(tags.map(([key = "", value = ""]) => [key, value]));
}

/**
 * How many Unicode characters a tag key or value holds. A letter outside the
 * Basic Multilingual Plane is one character and two UTF-16 code units.
 */
function length(text: string): number {
  let count = 0;

  // A string iterates by code point, where its length counts code units.
  for (const _character of text) {
    count += 1;
  }

  return count;
}

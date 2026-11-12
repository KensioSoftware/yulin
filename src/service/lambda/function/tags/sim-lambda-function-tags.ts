import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";

/**
 * The most tags real Lambda lets one function carry.
 */
const maximumTagCount = 50;
const maximumKeyLength = 128;
const maximumValueLength = 256;

/**
 * The key prefix AWS keeps for its own tags, which no request may write or
 * remove.
 */
const reservedKeyPrefix = "aws:";

/**
 * The tags on one simulated Lambda function.
 *
 * Tags belong to the function rather than to any version of it, so a version
 * published from the function shares the function's tags instead of copying
 * them, and a tag added after publishing is reported for every version.
 *
 * The limits are the ones real Lambda enforces, checked before anything is
 * written so a refused request leaves the tags as they were.
 */
export class SimLambdaFunctionTags {
  private readonly tags = new Map<string, string>();

  /**
   * Add tags, replacing the value of a key the function already carries.
   */
  tag(tags: Readonly<Record<string, string>> = {}): void {
    const entries = Object.entries(tags);

    for (const [key, value] of entries) {
      assertWritableKey(key);
      assertValue(key, value);
    }

    const combined = new Set([...this.tags.keys(), ...Object.keys(tags)]);

    if (combined.size > maximumTagCount) {
      throw new SimLambdaInvalidParameterValueException(
        `A function can have at most ${String(maximumTagCount)} tags, and ` +
          `this request would leave it with ${String(combined.size)}`,
      );
    }

    for (const [key, value] of entries) {
      this.tags.set(key, value);
    }
  }

  /**
   * Remove tags by key. A key the function does not carry is passed over, as
   * real Lambda passes it over.
   */
  untag(keys: readonly string[] = []): void {
    for (const key of keys) {
      assertWritableKey(key);
    }

    for (const key of keys) {
      this.tags.delete(key);
    }
  }

  /**
   * Whether the function carries no tags at all.
   */
  get isEmpty(): boolean {
    return this.tags.size === 0;
  }

  /**
   * The tags as the API reports them.
   */
  record(): Record<string, string> {
    return Object.fromEntries(this.tags);
  }
}

function assertWritableKey(key: string): void {
  if (key.length === 0 || key.length > maximumKeyLength) {
    throw new SimLambdaInvalidParameterValueException(
      `Tag key "${key}" must be between 1 and ` +
        `${String(maximumKeyLength)} characters long`,
    );
  }

  if (key.toLowerCase().startsWith(reservedKeyPrefix)) {
    throw new SimLambdaInvalidParameterValueException(
      `Tag key "${key}" uses the ${reservedKeyPrefix} prefix, which AWS ` +
        "reserves for its own tags",
    );
  }
}

function assertValue(key: string, value: unknown): void {
  if (typeof value !== "string") {
    throw new SimLambdaInvalidParameterValueException(
      `The value of tag "${key}" must be a string`,
    );
  }

  if (value.length > maximumValueLength) {
    throw new SimLambdaInvalidParameterValueException(
      `The value of tag "${key}" must be at most ` +
        `${String(maximumValueLength)} characters long`,
    );
  }
}

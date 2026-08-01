import type {
  SimDynamoDbTag,
  SimDynamoDbTagInput,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * Real DynamoDB takes a tag key of up to 128 characters, and a value of up to
 * 256. A value may be empty, where a key may not.
 */
const greatestKeyLength = 128;
const greatestValueLength = 256;

/**
 * The characters a tag is written with: letters, whitespace, digits and a few
 * punctuation marks.
 *
 * This is DynamoDB's own set, which is narrower than the one some other AWS
 * services take: there is no `@` in it.
 */
const allowedCharacters = /^[\p{L}\p{N}\s+\-=._:/]*$/u;

/**
 * The prefix AWS assigns tags under, which a caller may not.
 */
const reservedPrefix = "aws:";

/**
 * One tag on a simulated DynamoDB resource.
 *
 * A tag is a key and a value, both checked on the way in. Everything that makes
 * a key or a value acceptable is here rather than in the commands, so a tag
 * that arrived with CreateTable is held to what a tag from TagResource is.
 */
export class SimDynamoDbTableTag {
  public readonly key: string;
  public readonly value: string;

  private constructor(key: string, value: string) {
    this.key = key;
    this.value = value;
  }

  /**
   * Read a tag a request carries.
   */
  static fromInput(input: SimDynamoDbTagInput): SimDynamoDbTableTag {
    const key = readKey(input.Key);

    return new this(key, readValue(input.Value, key));
  }

  /**
   * Report this tag the way DynamoDB reports it.
   */
  toTag(): SimDynamoDbTag {
    return { Key: this.key, Value: this.value };
  }
}

/**
 * Read the key a tag is held under.
 */
function readKey(key: string | undefined): string {
  if (key === undefined || key.length === 0) {
    throw new SimDynamoDbValidationException(
      "A Tag requires a Key of at least one character",
    );
  }

  if (key.length > greatestKeyLength) {
    throw new SimDynamoDbValidationException(
      `Tag key '${key}' is ${key.length.toString()} characters, where ` +
        `${greatestKeyLength.toString()} is the most a tag key holds`,
    );
  }

  if (key.startsWith(reservedPrefix)) {
    throw new SimDynamoDbValidationException(
      `Tag key '${key}' begins with the reserved ${reservedPrefix} prefix, ` +
        `which AWS assigns to tags of its own rather than a caller assigning ` +
        `it`,
    );
  }

  assertWritable(key, `Tag key '${key}'`);

  return key;
}

/**
 * Read the value a tag holds.
 *
 * A tag value may be empty, where a key may not: DynamoDB takes a key on its
 * own as a label with nothing to say about it.
 */
function readValue(value: string | undefined, key: string): string {
  if (value === undefined) {
    throw new SimDynamoDbValidationException(
      `The tag '${key}' requires a Value, which may be empty`,
    );
  }

  if (value.length > greatestValueLength) {
    throw new SimDynamoDbValidationException(
      `The value of the tag '${key}' is ${value.length.toString()} ` +
        `characters, where ${greatestValueLength.toString()} is the most a ` +
        `tag value holds`,
    );
  }

  assertWritable(value, `The value of the tag '${key}'`);

  return value;
}

/**
 * Refuse text with a character a tag is not written with.
 */
function assertWritable(text: string, subject: string): void {
  if (allowedCharacters.test(text)) {
    return;
  }

  throw new SimDynamoDbValidationException(
    `${subject} has a character a tag does not take. Letters, whitespace, ` +
      `digits and + - = . _ : / are what a tag is written with.`,
  );
}

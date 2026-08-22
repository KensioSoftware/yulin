import { SimStatesInvalidTag } from "../error/sim-step-functions.error.js";

/**
 * Real Step Functions takes a tag key of up to 128 characters, and a value of
 * up to 256. A value may be empty, where a key may not.
 */
const greatestKeyLength = 128;
const greatestValueLength = 256;

/**
 * The characters a tag is written with: letters, digits, whitespace and a few
 * punctuation marks.
 *
 * Step Functions takes `@`, which some other AWS services leave out of their
 * own tag character set.
 */
const allowedCharacters = /^[\p{L}\p{N}\s+\-=._:/@]*$/u;

/**
 * The prefix AWS assigns tags under, which a caller may not.
 *
 * Reserved in a value as well as in a key. The AWS tagging restrictions put
 * both out of a caller's reach, and Step Functions holds its own tags to them.
 */
const reservedPrefix = "aws:";

/**
 * One tag on a simulated state machine.
 *
 * A tag is a key and a value, both checked on the way in. What makes a key or
 * a value acceptable is here rather than in the commands, so a tag that
 * arrived with `CreateStateMachine` is held to what a tag from `TagResource`
 * is.
 */
export class SimStateMachineTag {
  readonly key: string;
  readonly value: string;

  private constructor(key: string, value: string) {
    this.key = key;
    this.value = value;
  }

  /**
   * Read a tag a request carries.
   */
  static fromInput(input: SimStatesTagInput): SimStateMachineTag {
    const key = readKey(input.key);

    return new this(key, readValue(input.value, key));
  }

  /**
   * Report this tag the way Step Functions reports it.
   */
  toTag(): SimStatesTag {
    return { key: this.key, value: this.value };
  }
}

/**
 * A tag as a request carries it, where either half may be missing.
 */
export interface SimStatesTagInput {
  readonly key?: string | undefined;
  readonly value?: string | undefined;
}

/**
 * A tag as Step Functions reports it.
 */
export interface SimStatesTag {
  readonly key: string;
  readonly value: string;
}

/**
 * Read the key a tag is held under.
 */
function readKey(key: string | undefined): string {
  if (key === undefined || key === "") {
    throw new SimStatesInvalidTag(
      "A tag requires a key of at least one character.",
    );
  }

  if (key.length > greatestKeyLength) {
    throw new SimStatesInvalidTag(
      `The tag key '${key}' is ${key.length.toString()} characters, where ` +
        `${greatestKeyLength.toString()} is the most a tag key holds.`,
    );
  }

  if (key.startsWith(reservedPrefix)) {
    throw new SimStatesInvalidTag(
      `The tag key '${key}' begins with the reserved ${reservedPrefix} ` +
        "prefix, which AWS assigns tags of its own under.",
    );
  }

  assertWritable(key, `The tag key '${key}'`);

  return key;
}

/**
 * Read every tag a request carries.
 *
 * The whole list is read before a caller acts on any of it, so a request with
 * one bad tag in it changes nothing.
 */
export function readSimStatesTags(
  input: readonly SimStatesTagInput[],
): readonly SimStateMachineTag[] {
  return input.map((entry) => SimStateMachineTag.fromInput(entry));
}

/**
 * Read the value a tag holds.
 *
 * A tag value may be empty, where a key may not. Step Functions takes a key on
 * its own as a label with nothing to say about it.
 */
function readValue(value: string | undefined, key: string): string {
  if (value === undefined) {
    throw new SimStatesInvalidTag(
      `The tag '${key}' requires a value, which may be empty.`,
    );
  }

  if (value.length > greatestValueLength) {
    throw new SimStatesInvalidTag(
      `The value of the tag '${key}' is ${value.length.toString()} ` +
        `characters, where ${greatestValueLength.toString()} is the most a ` +
        "tag value holds.",
    );
  }

  if (value.startsWith(reservedPrefix)) {
    throw new SimStatesInvalidTag(
      `The value of the tag '${key}' begins with the reserved ` +
        `${reservedPrefix} prefix, which AWS assigns tags of its own under.`,
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

  throw new SimStatesInvalidTag(
    `${subject} has a character a tag does not take. Letters, digits, ` +
      "whitespace and + - = . _ : / @ are what a tag is written with.",
  );
}

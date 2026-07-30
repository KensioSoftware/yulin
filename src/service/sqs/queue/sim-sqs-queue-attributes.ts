import { SimSqsInvalidAttributeValue } from "../error/sim-sqs.error.js";
import { SimSqsQueueAttributeNames } from "./sim-sqs-queue-attribute-names.js";
import type { SimSqsQueueAttributeSpec } from "./sim-sqs-queue-attribute-specs.js";

/**
 * Queue attributes as a request carries them: SQS passes every attribute value
 * as a string, whatever the attribute means.
 */
export type SimSqsQueueAttributeInput = Readonly<
  Record<string, string | undefined>
>;

const integerPattern = /^-?\d+$/;

/**
 * Read an attribute value, refusing anything outside the range real SQS
 * accepts for it.
 */
function attributeNumber(
  spec: SimSqsQueueAttributeSpec,
  value: string,
): number {
  const invalid = new SimSqsInvalidAttributeValue(
    `Value ${value} for parameter ${spec.name} is invalid. Reason: Must be ` +
      `an integer from ${String(spec.minimum)} to ${String(spec.maximum)}.`,
  );

  if (!integerPattern.test(value)) {
    throw invalid;
  }

  const parsed = Number(value);

  if (parsed < spec.minimum || parsed > spec.maximum) {
    throw invalid;
  }

  return parsed;
}

/**
 * The attribute values held by one simulated queue.
 *
 * Attributes are held as numbers rather than as the strings a request carries,
 * because that is what the queue's behaviour is expressed in: a visibility
 * timeout is an amount of time, and a maximum message size is a number of
 * bytes. Strings are a wire format, applied on the way in and reported on the
 * way out.
 */
export class SimSqsQueueAttributes {
  private readonly values: ReadonlyMap<string, number>;

  private constructor(values: ReadonlyMap<string, number>) {
    this.values = values;
  }

  /**
   * The attribute values a queue created with no attributes has.
   */
  static defaults(): SimSqsQueueAttributes {
    return new this(
      new Map(
        SimSqsQueueAttributeNames.settable.map((spec) => [
          spec.name,
          spec.defaultValue,
        ]),
      ),
    );
  }

  /** The delay a new message with no delay of its own waits out. */
  get delaySeconds(): number {
    return this.numberFor("DelaySeconds");
  }

  /** The longest message body the queue accepts, in bytes. */
  get maximumMessageSizeBytes(): number {
    return this.numberFor("MaximumMessageSize");
  }

  /** How long a message stays on the queue before SQS drops it. */
  get messageRetentionSeconds(): number {
    return this.numberFor("MessageRetentionPeriod");
  }

  /** How long a received message is hidden from other consumers. */
  get visibilityTimeoutSeconds(): number {
    return this.numberFor("VisibilityTimeout");
  }

  /**
   * Apply the attribute values a request asks for, leaving the rest as they are.
   */
  with(requested: SimSqsQueueAttributeInput): SimSqsQueueAttributes {
    const values = new Map(this.values);

    for (const [name, value] of definedEntries(requested)) {
      const spec = SimSqsQueueAttributeNames.specForSetting(name);

      values.set(spec.name, attributeNumber(spec, value));
    }

    return new SimSqsQueueAttributes(values);
  }

  /**
   * Whether every attribute a request names already holds the value it asks for.
   *
   * This is the question CreateQueue asks about a name already taken. Only the
   * attributes in the request are compared, as real SQS compares them, so a
   * request carrying none matches any existing queue.
   */
  matches(requested: SimSqsQueueAttributeInput): boolean {
    return definedEntries(requested).every(([name, value]) => {
      const spec = SimSqsQueueAttributeNames.specForSetting(name);

      return this.numberFor(spec.name) === attributeNumber(spec, value);
    });
  }

  /**
   * The attributes as SQS reports them, back in their string form.
   */
  reported(): ReadonlyMap<string, string> {
    return new Map(
      this.values.entries().map(([name, value]) => [name, String(value)]),
    );
  }

  private numberFor(name: string): number {
    const value = this.values.get(name);

    /* v8 ignore next 3 -- unreachable: every settable attribute is present from
       construction, and only settable names are ever read. */
    if (value === undefined) {
      throw new SimSqsInvalidAttributeValue(`No value for attribute ${name}`);
    }

    return value;
  }
}

/**
 * The attribute entries a request actually carries.
 *
 * An SDK attribute map is a partial record, so an explicitly undefined value is
 * the absence of an attribute rather than a request to set one.
 */
function definedEntries(
  requested: SimSqsQueueAttributeInput,
): readonly [string, string][] {
  return Object.entries(requested).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
}

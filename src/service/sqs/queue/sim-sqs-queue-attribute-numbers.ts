import { SimSqsInvalidAttributeValue } from "../error/sim-sqs.error.js";
import { SimSqsQueueAttributeNames } from "./sim-sqs-queue-attribute-names.js";
import {
  simSqsJsonQueueAttributeNames,
  type SimSqsQueueAttributeSpec,
} from "./sim-sqs-queue-attribute-specs.js";
import type { SimSqsQueueAttributeInput } from "./sim-sqs-queue-attributes.js";

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
 * The numeric attribute entries a request actually carries.
 *
 * An SDK attribute map is a partial record, so an explicitly undefined value is
 * the absence of an attribute rather than a request to set one. The JSON
 * attributes are left out because they are documents with no numeric range to
 * be checked against.
 */
function numberEntries(
  requested: SimSqsQueueAttributeInput,
): readonly [string, string][] {
  return Object.entries(requested).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && !simSqsJsonQueueAttributeNames.has(entry[0]),
  );
}

/**
 * The queue attributes that are amounts: a timeout, a size, a delay.
 *
 * They are held as numbers rather than as the strings a request carries,
 * because that is what the queue's behaviour is expressed in. Strings are a
 * wire format, applied on the way in and reported on the way out.
 */
export class SimSqsQueueAttributeNumbers {
  private readonly values: ReadonlyMap<string, number>;

  private constructor(values: ReadonlyMap<string, number>) {
    this.values = values;
  }

  /**
   * The values a queue created with no attributes has.
   */
  static defaults(): SimSqsQueueAttributeNumbers {
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
    return this.get("DelaySeconds");
  }

  /** The longest message body the queue accepts, in bytes. */
  get maximumMessageSizeBytes(): number {
    return this.get("MaximumMessageSize");
  }

  /** How long a message stays on the queue before SQS drops it. */
  get messageRetentionSeconds(): number {
    return this.get("MessageRetentionPeriod");
  }

  /** How long a received message is hidden from other consumers. */
  get visibilityTimeoutSeconds(): number {
    return this.get("VisibilityTimeout");
  }

  /**
   * The value of one attribute.
   */
  get(name: string): number {
    const value = this.values.get(name);

    /* v8 ignore next 3 -- unreachable: every settable attribute is present from
       construction, and only settable names are ever read. */
    if (value === undefined) {
      throw new SimSqsInvalidAttributeValue(`No value for attribute ${name}`);
    }

    return value;
  }

  /**
   * Apply the values a request asks for, leaving the rest as they are.
   */
  with(requested: SimSqsQueueAttributeInput): SimSqsQueueAttributeNumbers {
    const values = new Map(this.values);

    for (const [name, value] of numberEntries(requested)) {
      const spec = SimSqsQueueAttributeNames.specForSetting(name);

      values.set(spec.name, attributeNumber(spec, value));
    }

    return new SimSqsQueueAttributeNumbers(values);
  }

  /**
   * Whether every numeric attribute a request names already holds the value it
   * asks for.
   */
  matches(requested: SimSqsQueueAttributeInput): boolean {
    return numberEntries(requested).every(([name, value]) => {
      const spec = SimSqsQueueAttributeNames.specForSetting(name);

      return this.get(spec.name) === attributeNumber(spec, value);
    });
  }

  /**
   * The values as SQS reports them, back in their string form.
   */
  reported(): ReadonlyMap<string, string> {
    return new Map<string, string>(
      this.values.entries().map(([name, value]) => [name, String(value)]),
    );
  }
}

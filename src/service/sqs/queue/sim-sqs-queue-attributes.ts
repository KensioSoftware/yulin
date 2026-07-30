import { SimSqsQueueAttributeNumbers } from "./sim-sqs-queue-attribute-numbers.js";
import { simSqsRedrivePolicyAttributeName } from "./sim-sqs-queue-attribute-specs.js";
import { SimSqsRedrivePolicy } from "./sim-sqs-redrive-policy.js";

/**
 * Queue attributes as a request carries them: SQS passes every attribute value
 * as a string, whatever the attribute means.
 */
export type SimSqsQueueAttributeInput = Readonly<
  Record<string, string | undefined>
>;

/**
 * The attribute values held by one simulated queue.
 *
 * They come in two kinds. Most are amounts, held as numbers because that is
 * what the queue's behaviour is expressed in. The redrive policy is a JSON
 * object, and a queue has none until one is set, so it is held apart from the
 * rest rather than squeezed into the same map.
 */
export class SimSqsQueueAttributes {
  private readonly numbers: SimSqsQueueAttributeNumbers;
  private readonly redrive: SimSqsRedrivePolicy | undefined;

  private constructor(
    numbers: SimSqsQueueAttributeNumbers,
    redrive: SimSqsRedrivePolicy | undefined,
  ) {
    this.numbers = numbers;
    this.redrive = redrive;
  }

  /**
   * The attribute values a queue created with no attributes has.
   */
  static defaults(): SimSqsQueueAttributes {
    return new this(SimSqsQueueAttributeNumbers.defaults(), undefined);
  }

  /** The delay a new message with no delay of its own waits out. */
  get delaySeconds(): number {
    return this.numbers.get("DelaySeconds");
  }

  /** The longest message body the queue accepts, in bytes. */
  get maximumMessageSizeBytes(): number {
    return this.numbers.get("MaximumMessageSize");
  }

  /** How long a message stays on the queue before SQS drops it. */
  get messageRetentionSeconds(): number {
    return this.numbers.get("MessageRetentionPeriod");
  }

  /** How long a received message is hidden from other consumers. */
  get visibilityTimeoutSeconds(): number {
    return this.numbers.get("VisibilityTimeout");
  }

  /** Where failed messages go, and after how many receives, if anywhere. */
  get redrivePolicy(): SimSqsRedrivePolicy | undefined {
    return this.redrive;
  }

  /**
   * Apply the attribute values a request asks for, leaving the rest as they are.
   */
  with(requested: SimSqsQueueAttributeInput): SimSqsQueueAttributes {
    return new SimSqsQueueAttributes(
      this.numbers.with(requested),
      this.redriveIn(requested),
    );
  }

  /**
   * Whether every attribute a request names already holds the value it asks for.
   *
   * This is the question CreateQueue asks about a name already taken. Only the
   * attributes in the request are compared, as real SQS compares them, so a
   * request carrying none matches any existing queue.
   */
  matches(requested: SimSqsQueueAttributeInput): boolean {
    return this.redriveMatches(requested) && this.numbers.matches(requested);
  }

  /**
   * The attributes as SQS reports them, back in their string form.
   *
   * The redrive policy is reported as the string it was set with, since that is
   * the string SQS holds the attribute as. A queue with no redrive policy
   * reports none, as real SQS leaves out an attribute a queue has no value for.
   */
  reported(): ReadonlyMap<string, string> {
    const reported = new Map(this.numbers.reported());

    if (this.redrive !== undefined) {
      reported.set(simSqsRedrivePolicyAttributeName, this.redrive.value);
    }

    return reported;
  }

  /**
   * The redrive policy after a request, which is the one it sets or the one
   * already there.
   */
  private redriveIn(
    requested: SimSqsQueueAttributeInput,
  ): SimSqsRedrivePolicy | undefined {
    // eslint-disable-next-line security/detect-object-injection -- a fixed key.
    const value = requested[simSqsRedrivePolicyAttributeName];

    if (value === undefined) {
      return this.redrive;
    }

    return SimSqsRedrivePolicy.parse(value);
  }

  private redriveMatches(requested: SimSqsQueueAttributeInput): boolean {
    // eslint-disable-next-line security/detect-object-injection -- a fixed key.
    const value = requested[simSqsRedrivePolicyAttributeName];

    if (value === undefined) {
      return true;
    }

    return this.redrive?.matches(SimSqsRedrivePolicy.parse(value)) === true;
  }
}

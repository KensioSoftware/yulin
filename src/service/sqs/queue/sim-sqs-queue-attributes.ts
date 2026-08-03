import { SimSqsQueueAttributeNumbers } from "./sim-sqs-queue-attribute-numbers.js";
import { SimSqsQueueJsonAttributes } from "./sim-sqs-queue-json-attributes.js";
import type { SimSqsQueuePolicy } from "./sim-sqs-queue-policy.js";
import type { SimSqsRedrivePolicy } from "./sim-sqs-redrive-policy.js";

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
 * what the queue's behaviour is expressed in. The redrive policy and the queue
 * policy are JSON documents, and a queue has neither until one is set, so they
 * are held apart from the rest rather than squeezed into the same map.
 */
export class SimSqsQueueAttributes {
  private readonly numbers: SimSqsQueueAttributeNumbers;
  private readonly documents: SimSqsQueueJsonAttributes;

  private constructor(
    numbers: SimSqsQueueAttributeNumbers,
    documents: SimSqsQueueJsonAttributes,
  ) {
    this.numbers = numbers;
    this.documents = documents;
  }

  /**
   * The attribute values a queue created with no attributes has.
   */
  static defaults(): SimSqsQueueAttributes {
    return new this(
      SimSqsQueueAttributeNumbers.defaults(),
      SimSqsQueueJsonAttributes.defaults(),
    );
  }

  /** The delay a new message with no delay of its own waits out. */
  get delaySeconds(): number {
    return this.numbers.delaySeconds;
  }

  /** The longest message body the queue accepts, in bytes. */
  get maximumMessageSizeBytes(): number {
    return this.numbers.maximumMessageSizeBytes;
  }

  /** How long a message stays on the queue before SQS drops it. */
  get messageRetentionSeconds(): number {
    return this.numbers.messageRetentionSeconds;
  }

  /** How long a received message is hidden from other consumers. */
  get visibilityTimeoutSeconds(): number {
    return this.numbers.visibilityTimeoutSeconds;
  }

  /** Where failed messages go, and after how many receives, if anywhere. */
  get redrivePolicy(): SimSqsRedrivePolicy | undefined {
    return this.documents.redrivePolicy;
  }

  /** Who the queue itself admits, if anyone. */
  get queuePolicy(): SimSqsQueuePolicy | undefined {
    return this.documents.queuePolicy;
  }

  /**
   * Apply the attribute values a request asks for, leaving the rest as they are.
   */
  with(requested: SimSqsQueueAttributeInput): SimSqsQueueAttributes {
    return new SimSqsQueueAttributes(
      this.numbers.with(requested),
      this.documents.with(requested),
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
    return this.documents.matches(requested) && this.numbers.matches(requested);
  }

  /**
   * The attributes as SQS reports them, back in their string form.
   *
   * The JSON documents are reported as the strings they were set with, since
   * those are the strings SQS holds the attributes as. A queue with no redrive
   * policy or no queue policy reports neither, as real SQS leaves out an
   * attribute a queue has no value for.
   */
  reported(): ReadonlyMap<string, string> {
    const reported = new Map(this.numbers.reported());

    this.documents.reportInto(reported);

    return reported;
  }
}

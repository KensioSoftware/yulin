import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimSqsQueueNameExists } from "../error/sim-sqs.error.js";
import type { SimSqsMessage } from "../message/sim-sqs-message.js";
import { SimSqsMessageStore } from "../message/sim-sqs-message-store.js";
import { SimSqsQueueArn } from "./sim-sqs-queue-arn.js";
import type { SimSqsQueueName } from "./sim-sqs-queue-name.js";
import type {
  SimSqsQueueAttributeInput,
  SimSqsQueueAttributes,
} from "./sim-sqs-queue-attributes.js";

const millisecondsPerSecond = 1000;

/**
 * Real SQS reports the two queue timestamps in whole seconds since the epoch,
 * unlike the message timestamps, which are in milliseconds.
 */
function epochSeconds(instant: Date): string {
  return String(Math.floor(instant.getTime() / millisecondsPerSecond));
}

interface SimSqsQueueProperties {
  readonly name: SimSqsQueueName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly attributes: SimSqsQueueAttributes;
  readonly createdAt: Date;
}

/**
 * One simulated standard queue.
 *
 * The queue owns its messages rather than a service-wide message table owning
 * them, because everything a message does depends on the queue's attributes: how
 * long it stays hidden once received, how long it is kept, and how big it is
 * allowed to be. Retention is applied whenever the messages are looked at, so
 * moving simulated time forward loses the messages AWS would have dropped
 * instead of holding them indefinitely.
 */
export class SimSqsQueue {
  public readonly name: SimSqsQueueName;
  public readonly arn: SimSqsQueueArn;
  public readonly createdAt: Date;

  private readonly messages = new SimSqsMessageStore();
  private settings: SimSqsQueueAttributes;
  private lastModifiedAt: Date;

  constructor(properties: SimSqsQueueProperties) {
    this.name = properties.name;
    this.arn = new SimSqsQueueArn({
      name: properties.name,
      accountRegionScope: properties.accountRegionScope,
    });
    this.createdAt = properties.createdAt;
    this.lastModifiedAt = properties.createdAt;
    this.settings = properties.attributes;
  }

  /**
   * The URL requests name this queue by.
   */
  get url(): string {
    return this.arn.url;
  }

  /**
   * This queue's URL, for a request that asked to create it again.
   *
   * Real SQS answers a repeated CreateQueue with the URL of the queue already
   * there when the attributes match, and refuses it when they differ. Only the
   * attributes the request named are compared.
   */
  urlWhenAttributesMatch(requested: SimSqsQueueAttributeInput): string {
    if (!this.settings.matches(requested)) {
      throw new SimSqsQueueNameExists(
        `A queue already exists with the name ${this.name.value} and ` +
          `different attributes to the ones requested`,
      );
    }

    return this.url;
  }

  /**
   * The attribute values this queue behaves by.
   */
  get attributes(): SimSqsQueueAttributes {
    return this.settings;
  }

  /**
   * Apply the attribute values a request asks for, as SetQueueAttributes does.
   */
  applyAttributes(
    requested: SimSqsQueueAttributeInput,
    modifiedAt: Date,
  ): void {
    this.settings = this.settings.with(requested);
    this.lastModifiedAt = modifiedAt;
  }

  /**
   * Take a newly sent message.
   */
  add(message: SimSqsMessage): void {
    this.messages.add(message);
  }

  /**
   * The messages that can be received at an instant, oldest first.
   */
  receivable(instant: Date, limit: number): readonly SimSqsMessage[] {
    this.dropExpired(instant);

    return this.messages.receivable(instant, limit);
  }

  /**
   * Record that a message was handed out under a receipt handle.
   */
  recordHandle(receiptHandle: string, message: SimSqsMessage): void {
    this.messages.recordHandle(receiptHandle, message);
  }

  /**
   * The message a receipt handle names, or undefined for a handle this queue
   * never issued.
   */
  messageForHandle(
    receiptHandle: string,
    instant: Date,
  ): SimSqsMessage | undefined {
    this.dropExpired(instant);

    return this.messages.forHandle(receiptHandle);
  }

  /**
   * Forget a deleted message.
   */
  removeMessage(message: SimSqsMessage): void {
    this.messages.remove(message);
  }

  /**
   * Forget every message on this queue, as PurgeQueue does.
   */
  purge(purgedAt: Date): void {
    this.messages.purge();
    this.lastModifiedAt = purgedAt;
  }

  /**
   * The attributes SQS reports about this queue, including the counts and
   * timestamps no request can set.
   */
  reportedAttributes(instant: Date): ReadonlyMap<string, string> {
    this.dropExpired(instant);

    const counts = this.messages.countsAt(instant);

    return new Map<string, string>([
      ...this.settings.reported(),
      ["ApproximateNumberOfMessages", String(counts.visible)],
      ["ApproximateNumberOfMessagesDelayed", String(counts.delayed)],
      ["ApproximateNumberOfMessagesNotVisible", String(counts.inFlight)],
      ["CreatedTimestamp", epochSeconds(this.createdAt)],
      ["LastModifiedTimestamp", epochSeconds(this.lastModifiedAt)],
      ["QueueArn", this.arn.value],
    ]);
  }

  private dropExpired(instant: Date): void {
    this.messages.dropExpired(instant, this.settings.messageRetentionSeconds);
  }
}

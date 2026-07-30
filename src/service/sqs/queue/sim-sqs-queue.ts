import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimSqsQueueNameExists } from "../error/sim-sqs.error.js";
import type { SimSqsMessage } from "../message/sim-sqs-message.js";
import { SimSqsMessageStore } from "../message/sim-sqs-message-store.js";
import type { SimSqsDeadLetterTargets } from "./sim-sqs-dead-letter-targets.js";
import type { SimSqsQueueActivity } from "./sim-sqs-queue-activity.js";
import { SimSqsQueueArn } from "./sim-sqs-queue-arn.js";
import type { SimSqsQueueName } from "./sim-sqs-queue-name.js";
import type {
  SimSqsQueueAttributeInput,
  SimSqsQueueAttributes,
} from "./sim-sqs-queue-attributes.js";
import { simSqsReportedQueueAttributes } from "./sim-sqs-queue-report.js";

interface SimSqsQueueProperties {
  readonly name: SimSqsQueueName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly attributes: SimSqsQueueAttributes;
  readonly createdAt: Date;
  readonly deadLetterTargets: SimSqsDeadLetterTargets;
  readonly activity: SimSqsQueueActivity;
}

/**
 * One simulated standard queue.
 *
 * The queue owns its messages rather than a service-wide message table owning
 * them, because everything a message does depends on the queue's attributes: how
 * long it stays hidden once received, how long it is kept, and how big it is
 * allowed to be. Retention and redrive are both applied whenever the messages
 * are looked at, so moving simulated time forward loses the messages AWS would
 * have dropped and moves the ones it would have given up on.
 */
export class SimSqsQueue {
  public readonly name: SimSqsQueueName;
  public readonly arn: SimSqsQueueArn;
  public readonly createdAt: Date;

  private readonly messages = new SimSqsMessageStore();
  private readonly deadLetterTargets: SimSqsDeadLetterTargets;
  private readonly activity: SimSqsQueueActivity;
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
    this.deadLetterTargets = properties.deadLetterTargets;
    this.activity = properties.activity;
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
   *
   * A redrive policy is only accepted once its dead-letter queue is there to
   * accept messages, as real SQS only accepts one then. A policy naming a queue
   * that does not exist would look like a working dead-letter queue and lose
   * the messages it was supposed to keep, so it fails here instead of later.
   */
  applyAttributes(
    requested: SimSqsQueueAttributeInput,
    modifiedAt: Date,
  ): void {
    const updated = this.settings.with(requested);

    this.deadLetterTargets.assertRequestedTarget(requested);

    this.settings = updated;
    this.lastModifiedAt = modifiedAt;
  }

  /**
   * Take a newly sent message.
   *
   * Anything watching the queue is told, which is how a Lambda event source
   * mapping learns there is something to poll for. A message moved here from
   * another queue arrives the same way, so a dead-letter queue with a mapping on
   * it is polled too.
   */
  add(message: SimSqsMessage): void {
    this.messages.add(message);
    this.announceAvailability(message);
  }

  /**
   * The messages that can be received at an instant, oldest first.
   */
  receivable(instant: Date, limit: number): readonly SimSqsMessage[] {
    this.applyLifecycle(instant);

    return this.messages.receivable(instant, limit);
  }

  /**
   * When the earliest message this queue cannot hand out yet becomes
   * receivable, or nothing when it holds no such message.
   *
   * This is not something SQS reports. It is how a consumer that cannot poll
   * continuously, such as a Lambda event source mapping, knows when to look
   * again at a queue whose messages are all in flight or delayed.
   */
  nextAvailability(instant: Date): Date | undefined {
    this.applyLifecycle(instant);

    return this.messages.nextAvailability(instant);
  }

  /**
   * Bring this queue up to date at an instant.
   *
   * Nothing is scheduled to age a message out or to give up on one. Both happen
   * on the simulation's clock: what the retention period has outlived is
   * dropped, and what has run out of receives moves to the dead-letter queue.
   * Running it twice at one instant does nothing the second time.
   */
  applyLifecycle(instant: Date): void {
    this.dropExpired(instant);
    this.deadLetterTargets.move({
      policy: this.settings.redrivePolicy,
      messages: this.messages,
      sourceQueueArn: this.arn.value,
      instant,
    });
  }

  /**
   * Record that a message was handed out under a receipt handle.
   *
   * A message handed out is hidden until its visibility timeout lapses, and
   * watchers are told when that is. Without it, a message another consumer
   * received would come back to the queue with nothing watching for it.
   */
  recordHandle(receiptHandle: string, message: SimSqsMessage): void {
    this.messages.recordHandle(receiptHandle, message);
    this.announceAvailability(message);
  }

  /**
   * Hide a message for a visibility timeout starting now, as
   * ChangeMessageVisibility does, telling watchers when it comes back.
   */
  hideMessage(
    message: SimSqsMessage,
    instant: Date,
    visibilityTimeoutSeconds: number,
  ): void {
    message.hideFor(instant, visibilityTimeoutSeconds);
    this.announceAvailability(message);
  }

  /**
   * The message a receipt handle names, or undefined for a handle this queue
   * never issued.
   */
  messageForHandle(
    receiptHandle: string,
    instant: Date,
  ): SimSqsMessage | undefined {
    this.applyLifecycle(instant);

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
    this.applyLifecycle(instant);

    return simSqsReportedQueueAttributes({
      settings: this.settings,
      counts: this.messages.countsAt(instant),
      createdAt: this.createdAt,
      lastModifiedAt: this.lastModifiedAt,
      queueArn: this.arn.value,
    });
  }

  /**
   * Tell this queue's watchers when a message can next be received.
   */
  private announceAvailability(message: SimSqsMessage): void {
    this.activity.messageAvailableAt(this.arn.value, message.availableFrom);
  }

  private dropExpired(instant: Date): void {
    this.messages.dropExpired(instant, this.settings.messageRetentionSeconds);
  }
}

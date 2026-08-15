import type { SimSqsQueueWatcher } from "../queue/sim-sqs-queue-activity.js";
import { sqsQueueUrlOf } from "../queue/sim-sqs-queue-arn.js";
import type { SimSqsPollMessage } from "./sim-sqs-poll-message.js";
import type { SimSqsPollQueueService } from "./sim-sqs-poll-queue-service.js";
import type {
  SimSqsPollDeleteRequest,
  SimSqsPollQueueRequest,
  SimSqsPollQueues,
  SimSqsPollReceiveRequest,
} from "./sim-sqs-poll-queues.js";

/**
 * What a queue's visibility timeout is when it has never been set.
 */
const defaultVisibilityTimeoutSeconds = 30;

interface SimSqsCommandPollQueuesProperties {
  readonly sqs: SimSqsPollQueueService;
}

/**
 * Simulated SQS as the queues a simulated consumer polls.
 *
 * Every call goes through the SQS command it would go through on real AWS, as
 * the consumer's own role, so a role without `sqs:ReceiveMessage`,
 * `sqs:DeleteMessage` or `sqs:GetQueueAttributes` on the queue is refused here
 * rather than quietly polling anyway.
 */
export class SimSqsCommandPollQueues implements SimSqsPollQueues {
  private readonly sqs: SimSqsPollQueueService;

  constructor(properties: SimSqsCommandPollQueuesProperties) {
    this.sqs = properties.sqs;
  }

  /**
   * How long a received message stays hidden, as the queue reports it.
   *
   * This is a GetQueueAttributes call, which is also how a consumer finds out
   * whether the queue it names is there at all: real AWS wants the same
   * permission for the same reason.
   */
  async visibilityTimeoutSeconds(
    request: SimSqsPollQueueRequest,
  ): Promise<number> {
    const output = await this.sqs.getQueueAttributes(
      {
        input: {
          QueueUrl: this.queueUrl(request),
          AttributeNames: ["VisibilityTimeout"],
        },
      },
      { caller: request.caller },
    );

    return Number(
      output.Attributes?.["VisibilityTimeout"] ??
        defaultVisibilityTimeoutSeconds,
    );
  }

  /**
   * Take up to a batch of messages off the queue.
   *
   * Every system attribute and message attribute is asked for, because a real
   * consumer sees them whether or not it reads them.
   */
  async receive(
    request: SimSqsPollReceiveRequest,
  ): Promise<readonly SimSqsPollMessage[]> {
    const output = await this.sqs.receiveMessage(
      {
        input: {
          QueueUrl: this.queueUrl(request),
          MaxNumberOfMessages: request.batchSize,
          MessageSystemAttributeNames: ["All"],
          MessageAttributeNames: ["All"],
        },
      },
      { caller: request.caller },
    );

    return output.Messages ?? [];
  }

  /**
   * Delete the messages of a batch the consumer handled.
   *
   * Batched because that is what a real consumer does with a handled batch, and
   * because simulated SQS authorizes a batch delete as `sqs:DeleteMessage`, the
   * action real IAM has.
   */
  async deleteMessages(request: SimSqsPollDeleteRequest): Promise<void> {
    if (request.receiptHandles.length === 0) {
      return;
    }

    await this.sqs.deleteMessageBatch(
      {
        input: {
          QueueUrl: this.queueUrl(request),
          Entries: request.receiptHandles.map((receiptHandle, index) => ({
            Id: String(index),
            ReceiptHandle: receiptHandle,
          })),
        },
      },
      { caller: request.caller },
    );
  }

  /**
   * When the earliest message the queue cannot hand out yet becomes
   * receivable.
   */
  nextAvailability(queueArn: string): Date | undefined {
    return this.sqs.queueActivity().nextAvailability(queueArn);
  }

  /**
   * Watch a queue for messages arriving on it.
   */
  watch(queueArn: string, watcher: SimSqsQueueWatcher): void {
    this.sqs.queueActivity().watch(queueArn, watcher);
  }

  /**
   * Stop watching a queue.
   */
  unwatch(queueArn: string, watcher: SimSqsQueueWatcher): void {
    this.sqs.queueActivity().unwatch(queueArn, watcher);
  }

  private queueUrl(request: SimSqsPollQueueRequest): string {
    return sqsQueueUrlOf(request.queueArn);
  }
}

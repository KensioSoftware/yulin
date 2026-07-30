import type {
  SimLambdaEventSourceDeleteRequest,
  SimLambdaEventSourceMessage,
  SimLambdaEventSourceQueueRequest,
  SimLambdaEventSourceQueues,
  SimLambdaEventSourceQueueWatcher,
  SimLambdaEventSourceReceiveRequest,
} from "./sim-lambda-event-source-queues.js";
import type { SimLambdaEventSourceQueueService } from "./sim-lambda-event-source-queue-service.js";
import { SimSqsEventSourceQueueAttributes } from "./sim-sqs-event-source-queue-attributes.js";
import { SimLambdaSqsEventSourceArn } from "./sim-lambda-sqs-event-source-arn.js";

interface SimSqsEventSourceQueuesProperties {
  readonly sqs: SimLambdaEventSourceQueueService;
}

/**
 * Simulated SQS as the queues a Lambda event source mapping polls.
 *
 * Every call goes through the SQS command it would go through on real AWS, as
 * the function's execution role, so a role without `sqs:ReceiveMessage`,
 * `sqs:DeleteMessage` or `sqs:GetQueueAttributes` on the queue is refused here
 * rather than quietly polling anyway.
 */
export class SimSqsEventSourceQueues implements SimLambdaEventSourceQueues {
  private readonly sqs: SimLambdaEventSourceQueueService;
  private readonly attributes: SimSqsEventSourceQueueAttributes;

  constructor(properties: SimSqsEventSourceQueuesProperties) {
    this.sqs = properties.sqs;
    this.attributes = new SimSqsEventSourceQueueAttributes(properties);
  }

  /**
   * How long a received message stays hidden.
   *
   * This is a GetQueueAttributes call, which is also how a mapping finds out
   * whether the queue it names is there at all: real Lambda needs the same
   * permission for the same reason.
   */
  async visibilityTimeoutSeconds(
    request: SimLambdaEventSourceQueueRequest,
  ): Promise<number> {
    return await this.attributes.visibilityTimeoutSeconds(request);
  }

  /**
   * Take up to a batch of messages off the queue.
   *
   * Every system attribute and message attribute is asked for, because a real
   * SQS event record carries them whether or not the function reads them.
   */
  async receive(
    request: SimLambdaEventSourceReceiveRequest,
  ): Promise<readonly SimLambdaEventSourceMessage[]> {
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
   * Delete the messages of a batch the function handled.
   *
   * Batched because that is what real Lambda does with a handled batch, and
   * because simulated SQS authorizes a batch delete as `sqs:DeleteMessage`, the
   * action real IAM has.
   */
  async deleteMessages(
    request: SimLambdaEventSourceDeleteRequest,
  ): Promise<void> {
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
   * Watch a queue for messages arriving on it.
   */
  watch(queueArn: string, watcher: SimLambdaEventSourceQueueWatcher): void {
    this.sqs.queueActivity().watch(queueArn, watcher);
  }

  /**
   * Stop watching a queue.
   */
  unwatch(queueArn: string, watcher: SimLambdaEventSourceQueueWatcher): void {
    this.sqs.queueActivity().unwatch(queueArn, watcher);
  }

  private queueUrl(request: SimLambdaEventSourceQueueRequest): string {
    return SimLambdaSqsEventSourceArn.of(request.queueArn).queueUrl;
  }
}

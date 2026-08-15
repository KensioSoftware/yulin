import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimSqsQueueWatcher } from "../queue/sim-sqs-queue-activity.js";
import type { SimSqsPollMessage } from "./sim-sqs-poll-message.js";

interface QueueCommandOptions {
  readonly caller: SimAwsCaller;
}

/**
 * The part of simulated SQS that says when a message has arrived on a queue.
 */
export interface SimSqsPollQueueActivity {
  nextAvailability(queueArn: string): Date | undefined;
  watch(queueArn: string, watcher: SimSqsQueueWatcher): void;
  unwatch(queueArn: string, watcher: SimSqsQueueWatcher): void;
}

/**
 * The narrow slice of simulated SQS that polling needs.
 *
 * It is a structural interface rather than the SQS service object so that a
 * poller is built with the three operations it makes and nothing else. SimSqs
 * implements it without saying so.
 */
export interface SimSqsPollQueueService {
  getQueueAttributes(
    command: {
      input: { QueueUrl: string; AttributeNames: readonly string[] };
    },
    options?: QueueCommandOptions,
  ): Promise<{ Attributes?: Record<string, string> | undefined }>;

  receiveMessage(
    command: {
      input: {
        QueueUrl: string;
        MaxNumberOfMessages: number;
        MessageSystemAttributeNames: readonly string[];
        MessageAttributeNames: readonly string[];
      };
    },
    options?: QueueCommandOptions,
  ): Promise<{ Messages?: readonly SimSqsPollMessage[] | undefined }>;

  deleteMessageBatch(
    command: {
      input: {
        QueueUrl: string;
        Entries: readonly { Id: string; ReceiptHandle: string }[];
      };
    },
    options?: QueueCommandOptions,
  ): Promise<unknown>;

  queueActivity(): SimSqsPollQueueActivity;
}

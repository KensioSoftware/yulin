import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimLambdaEventSourceMessage,
  SimLambdaEventSourceQueueWatcher,
} from "./sim-lambda-event-source-queues.js";

interface QueueCommandOptions {
  readonly caller: SimAwsCaller;
}

/**
 * The narrow slice of simulated SQS that event source polling needs.
 * SimSqs structurally implements this interface.
 */
export interface SimLambdaEventSourceQueueService {
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
  ): Promise<{ Messages?: readonly SimLambdaEventSourceMessage[] | undefined }>;

  deleteMessageBatch(
    command: {
      input: {
        QueueUrl: string;
        Entries: readonly { Id: string; ReceiptHandle: string }[];
      };
    },
    options?: QueueCommandOptions,
  ): Promise<unknown>;

  queueActivity(): SimLambdaEventSourceQueueActivity;
}

/**
 * The part of simulated SQS that says when a message has arrived on a queue.
 */
export interface SimLambdaEventSourceQueueActivity {
  watch(queueArn: string, watcher: SimLambdaEventSourceQueueWatcher): void;
  unwatch(queueArn: string, watcher: SimLambdaEventSourceQueueWatcher): void;
}

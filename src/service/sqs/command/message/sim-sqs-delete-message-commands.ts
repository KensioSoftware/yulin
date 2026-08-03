import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import type { SimSqsQueueAccess } from "../queue/sim-sqs-queue-access.js";
import { requireBatchEntries, runBatch } from "./sim-sqs-batch-entries.js";
import { SimSqsMessageHandles } from "./sim-sqs-message-handles.js";
import type {
  SimDeleteMessageBatchCommand,
  SimDeleteMessageBatchCommandOutput,
  SimDeleteMessageCommand,
  SimDeleteMessageCommandOutput,
  SimSqsDeleteMessageBatchEntry,
  SimSqsDeleteMessageBatchResultEntry,
} from "./consume.command.js";

/**
 * Real SQS authorizes a batch delete as `sqs:DeleteMessage`. There is no
 * `sqs:DeleteMessageBatch` action, so a policy naming one grants nothing.
 */
const messageDeletionAction = "sqs:DeleteMessage";

interface SimSqsDeleteMessageCommandsProperties {
  readonly access: SimSqsQueueAccess;
  readonly clock: BackgroundScheduler;
}

/**
 * The commands a consumer finishes a message with.
 */
export class SimSqsDeleteMessageCommands {
  private readonly access: SimSqsQueueAccess;
  private readonly handles: SimSqsMessageHandles;

  constructor(properties: SimSqsDeleteMessageCommandsProperties) {
    this.access = properties.access;
    this.handles = new SimSqsMessageHandles({ clock: properties.clock });
  }

  /**
   * Delete one message by the receipt handle it was received with.
   */
  deleteMessage(
    command: SimDeleteMessageCommand,
    options?: SimSqsRequestOptions,
  ): SimDeleteMessageCommandOutput {
    const queue = this.access.requireByUrl(
      messageDeletionAction,
      command.input.QueueUrl,
      options,
    );

    this.delete(queue, command.input.ReceiptHandle);

    return { $metadata: {} };
  }

  /**
   * Delete up to ten messages at once.
   */
  deleteMessageBatch(
    command: SimDeleteMessageBatchCommand,
    options?: SimSqsRequestOptions,
  ): SimDeleteMessageBatchCommandOutput {
    const queue = this.access.requireByUrl(
      messageDeletionAction,
      command.input.QueueUrl,
      options,
    );
    const entries = requireBatchEntries(command.input.Entries, "DeleteMessage");

    const outcome = runBatch(
      entries,
      (
        entry: SimSqsDeleteMessageBatchEntry,
        id,
      ): SimSqsDeleteMessageBatchResultEntry => {
        this.delete(queue, entry.ReceiptHandle);

        return { Id: id };
      },
    );

    return {
      $metadata: {},
      Successful: outcome.successful,
      Failed: outcome.failed,
    };
  }

  /**
   * Delete the message a receipt handle names.
   *
   * A handle from an earlier receive is accepted and deletes nothing, which is
   * what real SQS does with one: the receive it belongs to has been superseded,
   * so the message another consumer now holds is left where it is. That is the
   * failure a consumer slower than the visibility timeout actually hits.
   */
  private delete(queue: SimSqsQueue, requested: string | undefined): void {
    const receiptHandle = SimSqsMessageHandles.required(requested);
    const message = this.handles.message(queue, receiptHandle);

    if (message.holdsReceiptHandle(receiptHandle)) {
      queue.removeMessage(message);
    }
  }
}

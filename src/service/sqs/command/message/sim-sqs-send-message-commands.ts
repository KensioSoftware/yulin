import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import type { SimSqsMessageWriter } from "../../message/sim-sqs-message-writer.js";
import type { SimSqsQueueAccess } from "../queue/sim-sqs-queue-access.js";
import { requireBatchEntries, runBatch } from "./sim-sqs-batch-entries.js";
import {
  sentMessageAttributesDigest,
  sentMessageWrite,
} from "./sim-sqs-sent-message.js";
import type {
  SimSendMessageBatchCommand,
  SimSendMessageBatchCommandOutput,
  SimSendMessageCommand,
  SimSendMessageCommandOutput,
  SimSqsSendMessageBatchResultEntry,
} from "./send.command.js";

/**
 * Real SQS authorizes a batch send as `sqs:SendMessage`. There is no
 * `sqs:SendMessageBatch` action, so a policy naming one grants nothing.
 */
const messageSendAction = "sqs:SendMessage";

interface SimSqsSendMessageCommandsProperties {
  readonly access: SimSqsQueueAccess;
  readonly writer: SimSqsMessageWriter;
}

/**
 * The commands that put messages on a queue.
 */
export class SimSqsSendMessageCommands {
  private readonly access: SimSqsQueueAccess;
  private readonly writer: SimSqsMessageWriter;

  constructor(properties: SimSqsSendMessageCommandsProperties) {
    this.access = properties.access;
    this.writer = properties.writer;
  }

  /**
   * Send one message.
   */
  send(
    command: SimSendMessageCommand,
    options?: SimSqsRequestOptions,
  ): SimSendMessageCommandOutput {
    const queue = this.access.requireByUrl(
      messageSendAction,
      command.input.QueueUrl,
      options,
    );
    const message = this.writer.write(queue, sentMessageWrite(command.input));

    return {
      $metadata: {},
      MessageId: message.messageId,
      MD5OfMessageBody: message.body.digest,
      MD5OfMessageAttributes: sentMessageAttributesDigest(message),
    };
  }

  /**
   * Send up to ten messages at once.
   *
   * A message one entry cannot send is reported in `Failed` while the rest of the
   * batch goes through, as real SQS reports it.
   */
  sendBatch(
    command: SimSendMessageBatchCommand,
    options?: SimSqsRequestOptions,
  ): SimSendMessageBatchCommandOutput {
    const queue = this.access.requireByUrl(
      messageSendAction,
      command.input.QueueUrl,
      options,
    );
    const entries = requireBatchEntries(command.input.Entries, "SendMessage");

    const outcome = runBatch(
      entries,
      (entry, id): SimSqsSendMessageBatchResultEntry => {
        const message = this.writer.write(queue, sentMessageWrite(entry));

        return {
          Id: id,
          MessageId: message.messageId,
          MD5OfMessageBody: message.body.digest,
          MD5OfMessageAttributes: sentMessageAttributesDigest(message),
        };
      },
    );

    return {
      $metadata: {},
      Successful: outcome.successful,
      Failed: outcome.failed,
    };
  }
}

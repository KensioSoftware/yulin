import type { SimSqsMessage } from "../../message/sim-sqs-message.js";
import { SimSqsRequestedSystemAttributes } from "../../message/sim-sqs-message-system-attributes.js";
import { makeSimSqsReceiptHandle } from "../../message/sim-sqs-receipt-handle.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import type {
  SimReceiveMessageCommandInput,
  SimSqsReceivedMessage,
} from "./receive.command.js";
import {
  assertWaitTime,
  refuseUnsimulatedReceiveInput,
  requestedMessageCount,
  visibilityTimeoutFor,
} from "./sim-sqs-receive-limits.js";
import { SimSqsReceivedMessageView } from "./sim-sqs-received-message-view.js";

/**
 * One checked receive request.
 *
 * Everything a receive decides before it hands anything out lives here: how many
 * messages it may take, how long they stay hidden, and how they are reported. The
 * whole request is checked before the first message is touched, so an invalid
 * request never half-receives one.
 */
export class SimSqsReceiveRequest {
  public readonly messageCount: number;

  private readonly visibilityTimeoutSeconds: number;
  private readonly view: SimSqsReceivedMessageView;

  private constructor(
    input: SimReceiveMessageCommandInput,
    queue: SimSqsQueue,
  ) {
    this.messageCount = requestedMessageCount(input.MaxNumberOfMessages);
    this.visibilityTimeoutSeconds = visibilityTimeoutFor(queue, input);
    this.view = new SimSqsReceivedMessageView({
      systemAttributes: SimSqsRequestedSystemAttributes.of(
        input.MessageSystemAttributeNames,
        input.AttributeNames,
      ),
      messageAttributeNames: input.MessageAttributeNames,
    });
  }

  /**
   * Read a receive request, refusing one real SQS would refuse.
   */
  static of(
    input: SimReceiveMessageCommandInput,
    queue: SimSqsQueue,
  ): SimSqsReceiveRequest {
    refuseUnsimulatedReceiveInput(input);
    assertWaitTime(input.WaitTimeSeconds);

    return new this(input, queue);
  }

  /**
   * Take the messages this request found, or nothing at all.
   *
   * Real SQS sends no `Messages` field rather than an empty list when there is
   * nothing to hand out, so an empty receive is reported as absence.
   */
  taken(
    queue: SimSqsQueue,
    found: readonly SimSqsMessage[],
    receivedAt: Date,
  ): readonly SimSqsReceivedMessage[] | undefined {
    if (found.length === 0) {
      return undefined;
    }

    return found.map((message) => this.take(queue, message, receivedAt));
  }

  /**
   * Take one message: hide it, record the handle it went out under, and report it.
   */
  private take(
    queue: SimSqsQueue,
    message: SimSqsMessage,
    receivedAt: Date,
  ): SimSqsReceivedMessage {
    const receiptHandle = makeSimSqsReceiptHandle();

    message.receiveAt(receivedAt, this.visibilityTimeoutSeconds, receiptHandle);
    queue.recordHandle(receiptHandle, message);

    return this.view.of(message, receiptHandle);
  }
}

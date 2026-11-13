import type { SimSqsMessage } from "../../message/sim-sqs-message.js";
import { SimSqsRequestedSystemAttributes } from "../../message/sim-sqs-message-system-attributes.js";
import { makeSimSqsReceiptHandle } from "../../message/sim-sqs-receipt-handle.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import type {
  SimReceiveMessageCommandInput,
  SimSqsReceivedMessage,
} from "./receive.command.js";
import type { SimSqsTakenMessage } from "./sim-sqs-receive-attempts.js";
import {
  assertWaitTime,
  receiveAttemptIdFor,
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
  public readonly attemptId: string | undefined;

  private readonly visibilityTimeoutSeconds: number;
  private readonly view: SimSqsReceivedMessageView;

  private constructor(
    input: SimReceiveMessageCommandInput,
    queue: SimSqsQueue,
  ) {
    this.messageCount = requestedMessageCount(input.MaxNumberOfMessages);
    this.attemptId = receiveAttemptIdFor(queue, input);
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
    assertWaitTime(input.WaitTimeSeconds);

    return new this(input, queue);
  }

  /**
   * Take the messages this request found: hide each one and record the handle
   * it went out under.
   */
  taken(
    queue: SimSqsQueue,
    found: readonly SimSqsMessage[],
    receivedAt: Date,
  ): readonly SimSqsTakenMessage[] {
    return found.map((message) => {
      const receiptHandle = makeSimSqsReceiptHandle();

      message.receiveAt(
        receivedAt,
        this.visibilityTimeoutSeconds,
        receiptHandle,
      );
      queue.recordHandle(receiptHandle, message);

      return { message, receiptHandle };
    });
  }

  /**
   * Take again the messages an earlier receive under the same attempt id took,
   * which resets their visibility timeout and keeps their receipt handles.
   */
  retaken(
    queue: SimSqsQueue,
    taken: readonly SimSqsTakenMessage[],
    receivedAt: Date,
  ): readonly SimSqsTakenMessage[] {
    taken.forEach(({ message }) => {
      queue.hideMessage(message, receivedAt, this.visibilityTimeoutSeconds);
    });

    return taken;
  }

  /**
   * The messages taken, as the response reports them.
   *
   * Real SQS sends no `Messages` field rather than an empty list when there is
   * nothing to hand out, so an empty receive is reported as absence.
   */
  reported(
    taken: readonly SimSqsTakenMessage[],
  ): readonly SimSqsReceivedMessage[] | undefined {
    if (taken.length === 0) {
      return undefined;
    }

    return taken.map(({ message, receiptHandle }) =>
      this.view.of(message, receiptHandle),
    );
  }
}

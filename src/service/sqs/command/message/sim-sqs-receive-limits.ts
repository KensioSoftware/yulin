import {
  SimSqsInvalidParameterValue,
  SimSqsUnsupportedOperation,
} from "../../error/sim-sqs.error.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import type { SimReceiveMessageCommandInput } from "./receive.command.js";

const maximumMessages = 10;
const maximumVisibilityTimeoutSeconds = 43_200;
const maximumWaitTimeSeconds = 20;

/**
 * How many messages a request may be answered with.
 */
export function requestedMessageCount(requested: number | undefined): number {
  if (requested === undefined) {
    return 1;
  }

  if (
    !Number.isSafeInteger(requested) ||
    requested < 1 ||
    requested > maximumMessages
  ) {
    throw new SimSqsInvalidParameterValue(
      `Value ${String(requested)} for parameter MaxNumberOfMessages is ` +
        `invalid. Reason: Must be between 1 and ${String(maximumMessages)}, ` +
        `if provided.`,
    );
  }

  return requested;
}

/**
 * How long the messages this request hands out stay hidden.
 *
 * A request may override the queue's visibility timeout for the messages it
 * receives, which is how a consumer with a slow handler asks for longer.
 */
export function visibilityTimeoutFor(
  queue: SimSqsQueue,
  input: SimReceiveMessageCommandInput,
): number {
  const requested = input.VisibilityTimeout;

  if (requested === undefined) {
    return queue.attributes.visibilityTimeoutSeconds;
  }

  if (
    !Number.isSafeInteger(requested) ||
    requested < 0 ||
    requested > maximumVisibilityTimeoutSeconds
  ) {
    throw new SimSqsInvalidParameterValue(
      `Value ${String(requested)} for parameter VisibilityTimeout is ` +
        `invalid. Reason: Must be an integer from 0 to ` +
        `${String(maximumVisibilityTimeoutSeconds)}.`,
    );
  }

  return requested;
}

/**
 * Check a long polling wait time, which this simulation accepts and does not
 * wait out.
 *
 * There is nothing to wait for in process: a receive answers from state that is
 * already there, so waiting could only ever time out. Returning at once is the
 * honest behaviour, and it is documented as a divergence rather than hidden.
 */
export function assertWaitTime(requested: number | undefined): void {
  if (requested === undefined) {
    return;
  }

  if (
    !Number.isSafeInteger(requested) ||
    requested < 0 ||
    requested > maximumWaitTimeSeconds
  ) {
    throw new SimSqsInvalidParameterValue(
      `Value ${String(requested)} for parameter WaitTimeSeconds is invalid. ` +
        `Reason: Must be an integer from 0 to ` +
        `${String(maximumWaitTimeSeconds)}.`,
    );
  }
}

const attemptIdPattern = /^[!-~]{1,128}$/u;

/**
 * The receive request attempt id a FIFO receive can be retried by.
 *
 * It applies only to a FIFO queue. What real SQS does with one sent to a
 * standard queue is not documented, so it is refused there rather than
 * guessed at.
 */
export function receiveAttemptIdFor(
  queue: SimSqsQueue,
  input: SimReceiveMessageCommandInput,
): string | undefined {
  const attemptId = input.ReceiveRequestAttemptId;

  if (attemptId === undefined) {
    return undefined;
  }

  if (!queue.name.isFifo) {
    throw new SimSqsUnsupportedOperation(
      "ReceiveRequestAttemptId applies only to FIFO queues, and simulated " +
        "SQS refuses it for a standard queue",
    );
  }

  if (!attemptIdPattern.test(attemptId)) {
    throw new SimSqsInvalidParameterValue(
      `Value ${attemptId} for parameter ReceiveRequestAttemptId is invalid. ` +
        `Reason: Must be 1 to 128 alphanumeric or punctuation characters.`,
    );
  }

  return attemptId;
}

import { createHash } from "node:crypto";
import {
  SimSqsInvalidParameterValue,
  SimSqsMissingParameter,
} from "../error/sim-sqs.error.js";
import type { SimSqsFifoQueueAttributes } from "../queue/sim-sqs-fifo-queue-attributes.js";
import type { SimSqsMessageOrdering } from "./sim-sqs-message.js";

/**
 * A message group id or deduplication id: up to 128 alphanumeric and
 * punctuation characters, which is every printable ASCII character but a
 * space.
 */
const tokenPattern = /^[!-~]{1,128}$/u;

/**
 * What a sender asked for about a message's order and deduplication.
 */
export interface SimSqsRequestedOrdering {
  readonly body: string;
  readonly messageGroupId?: string | undefined;
  readonly deduplicationId?: string | undefined;
  readonly delaySeconds: number | undefined;
}

/**
 * A message's place in order, and the key a FIFO queue deduplicates it by.
 */
export interface SimSqsCheckedOrdering {
  readonly ordering: SimSqsMessageOrdering;
  readonly deduplicationKey: string | undefined;
}

/**
 * Check what a send asks for about order against the queue it is sent to.
 *
 * A standard queue takes a message group, which real SQS uses for fair
 * queueing, and refuses a deduplication id. A FIFO queue requires a message
 * group, refuses a per-message delay, and needs a deduplication id from either
 * the sender or the body.
 */
export function simSqsCheckedOrdering(
  fifo: SimSqsFifoQueueAttributes | undefined,
  requested: SimSqsRequestedOrdering,
): SimSqsCheckedOrdering {
  const messageGroupId = checkedToken(
    "MessageGroupId",
    requested.messageGroupId,
  );

  if (fifo === undefined) {
    refuseForQueueType("MessageDeduplicationId", requested.deduplicationId);

    return { ordering: { messageGroupId }, deduplicationKey: undefined };
  }

  if (messageGroupId === undefined) {
    throw new SimSqsMissingParameter(
      "The request must contain the parameter MessageGroupId.",
    );
  }

  refuseForQueueType("DelaySeconds", requested.delaySeconds);

  const deduplicationId = deduplicationIdFor(fifo, requested);

  return {
    ordering: { messageGroupId, deduplicationId },
    deduplicationKey: deduplicationKeyFor(
      fifo,
      messageGroupId,
      deduplicationId,
    ),
  };
}

/**
 * The deduplication id a FIFO message carries: the sender's own, or the
 * SHA-256 of the body when the queue deduplicates by content.
 */
function deduplicationIdFor(
  fifo: SimSqsFifoQueueAttributes,
  requested: SimSqsRequestedOrdering,
): string {
  const explicit = checkedToken(
    "MessageDeduplicationId",
    requested.deduplicationId,
  );

  if (explicit !== undefined) {
    return explicit;
  }

  if (!fifo.contentBasedDeduplication) {
    throw new SimSqsInvalidParameterValue(
      "The queue should either have ContentBasedDeduplication enabled or " +
        "MessageDeduplicationId provided explicitly",
    );
  }

  return createHash("sha256").update(requested.body, "utf8").digest("hex");
}

/**
 * What two sends have to share to be duplicates: the id alone, or the id
 * within one message group when the queue deduplicates per group.
 */
function deduplicationKeyFor(
  fifo: SimSqsFifoQueueAttributes,
  messageGroupId: string,
  deduplicationId: string,
): string {
  if (fifo.deduplicatesPerMessageGroup) {
    return JSON.stringify([messageGroupId, deduplicationId]);
  }

  return deduplicationId;
}

function checkedToken(
  name: string,
  value: string | undefined,
): string | undefined {
  if (value !== undefined && !tokenPattern.test(value)) {
    throw new SimSqsInvalidParameterValue(
      `Value ${value} for parameter ${name} is invalid. Reason: Must be 1 to ` +
        `128 alphanumeric or punctuation characters.`,
    );
  }

  return value;
}

/**
 * Refuse a request parameter the queue's type does not take, in the words
 * real SQS uses.
 */
function refuseForQueueType(
  name: string,
  value: string | number | undefined,
): void {
  if (value !== undefined) {
    throw new SimSqsInvalidParameterValue(
      `Value ${String(value)} for parameter ${name} is invalid. Reason: The ` +
        `request include parameter that is not valid for this queue type.`,
    );
  }
}

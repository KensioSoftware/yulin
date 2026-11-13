import { SimLambdaEventSourceBatchRules } from "../sim-lambda-event-source-batch-rules.js";
import { SimLambdaNoRetryLimits } from "../sim-lambda-event-source-retry-limits.js";
import { SimLambdaNoStartingPosition } from "../sim-lambda-event-source-starting-position.js";

/**
 * What a function's execution role has to be allowed to do on a queue for
 * Lambda to poll it.
 *
 * These are the three operations real Lambda checks when an SQS event source
 * mapping is created, and the three its poller performs afterwards.
 */
export const sqsPollingOperations = [
  "ReceiveMessage",
  "DeleteMessage",
  "GetQueueAttributes",
] as const;

/**
 * The batch sizes an SQS event source delivers with.
 *
 * Ten is both the batch real Lambda uses when the mapping names none, and the
 * largest batch it delivers from a standard queue without a batching window to
 * fill a bigger one. With a window it delivers up to 10,000.
 */
export const sqsBatchRules = new SimLambdaEventSourceBatchRules({
  defaultSize: 10,
  maximumSize: 10_000,
  largestWithoutWindow: 10,
  sourceDescription: "a queue",
  unitName: "messages",
});

/**
 * The batch sizes a FIFO queue delivers with.
 *
 * Real Lambda caps a FIFO queue mapping at ten messages and takes no batching
 * window for one, since waiting to fill a batch would hold up every message
 * group behind the one being gathered.
 */
export const sqsFifoBatchRules = new SimLambdaEventSourceBatchRules({
  defaultSize: 10,
  maximumSize: 10,
  sourceDescription: "a FIFO queue",
  unitName: "messages",
  windowRefusal: "Batching window is not supported for FIFO queues",
});

/**
 * A queue has no starting position: a mapping on one takes whatever is at the
 * front of the queue, and there is nowhere else it could start from.
 */
export const sqsStartingPositionRules = new SimLambdaNoStartingPosition(
  "a queue",
);

/**
 * A queue keeps its own count of how often a message has been received, so
 * neither of Lambda's failed-batch limits is a queue mapping's to keep.
 */
export const sqsRetryLimitRules = new SimLambdaNoRetryLimits(
  "a queue",
  "a message the function never handles is left to the queue's own redrive " +
    "policy",
);

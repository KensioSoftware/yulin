import {
  SimSqsInvalidAttributeName,
  SimSqsInvalidAttributeValue,
} from "../../error/sim-sqs.error.js";
import {
  SimSqsFifoQueueAttributes,
  simSqsFifoQueueAttributeName,
} from "../../queue/sim-sqs-fifo-queue-attributes.js";
import {
  type SimSqsQueueType,
  SimSqsStandardQueueType,
} from "../../queue/sim-sqs-queue-type.js";
import type { SimSqsQueueAttributeInput } from "../../queue/sim-sqs-queue-attributes.js";

/**
 * The queue type a CreateQueue request asks for, and the rest of its
 * attributes.
 *
 * `FifoQueue` is not an attribute the queue goes on to hold like the others. It
 * decides which kind of queue is created, so it is taken out of the request
 * before the rest are applied.
 */
export interface SimSqsRequestedQueueType {
  readonly fifo: boolean;
  readonly type: SimSqsQueueType;
  readonly attributes: SimSqsQueueAttributeInput;
}

/**
 * Read the queue type out of a CreateQueue request's attributes.
 *
 * Real SQS takes only `true`. A standard queue is asked for by leaving the
 * attribute out, and `false` is answered as an attribute it does not know,
 * which is what tools that always send the attribute run into.
 */
export function simSqsRequestedQueueType(
  requested: SimSqsQueueAttributeInput,
): SimSqsRequestedQueueType {
  const { [simSqsFifoQueueAttributeName]: fifo, ...attributes } = requested;

  if (fifo === undefined) {
    return { fifo: false, type: new SimSqsStandardQueueType(), attributes };
  }

  if (fifo === "false") {
    throw new SimSqsInvalidAttributeName(
      "Unknown Attribute FifoQueue. A standard queue is created by leaving " +
        "FifoQueue out rather than setting it to false.",
    );
  }

  if (fifo !== "true") {
    throw new SimSqsInvalidAttributeValue(
      `Invalid value for the parameter FifoQueue. Reason: Must be true, ` +
        `not ${fifo}.`,
    );
  }

  return { fifo: true, type: SimSqsFifoQueueAttributes.defaults(), attributes };
}

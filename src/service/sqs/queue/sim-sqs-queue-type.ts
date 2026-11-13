import { SimSqsInvalidAttributeName } from "../error/sim-sqs.error.js";
import type { SimSqsFifoQueueAttributes } from "./sim-sqs-fifo-queue-attributes.js";
import { simSqsFifoQueueAttributeNames } from "./sim-sqs-fifo-queue-attributes.js";
import type { SimSqsQueueAttributeInput } from "./sim-sqs-queue-attributes.js";

/**
 * The FIFO attribute entries a request carries.
 */
export function simSqsFifoEntries(
  requested: SimSqsQueueAttributeInput,
): readonly [string, string][] {
  return Object.entries(requested).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && simSqsFifoQueueAttributeNames.has(entry[0]),
  );
}

/**
 * What one kind of queue makes of the FIFO attributes.
 *
 * A standard queue has none of them and a FIFO queue has all of them, so the
 * two kinds answer the same questions rather than every caller asking which
 * kind it holds.
 */
export interface SimSqsQueueType {
  readonly fifo: SimSqsFifoQueueAttributes | undefined;
  with(requested: SimSqsQueueAttributeInput): SimSqsQueueType;
  matches(requested: SimSqsQueueAttributeInput): boolean;
  reportInto(reported: Map<string, string>): void;
}

/**
 * A standard queue, which has none of the FIFO attributes.
 *
 * Real SQS answers a FIFO attribute set on a standard queue as an attribute it
 * does not know, so that is what this does.
 */
export class SimSqsStandardQueueType implements SimSqsQueueType {
  public readonly fifo = undefined;

  /**
   * Refuse a request setting a FIFO attribute on a standard queue.
   */
  with(requested: SimSqsQueueAttributeInput): SimSqsQueueType {
    const [name] = simSqsFifoEntries(requested)[0] ?? [];

    if (name !== undefined) {
      throw new SimSqsInvalidAttributeName(
        `Unknown Attribute ${name}. It applies only to FIFO queues, and a ` +
          `queue is made a FIFO queue when it is created.`,
      );
    }

    return this;
  }

  /**
   * A standard queue matches a request naming no FIFO attribute.
   */
  matches(requested: SimSqsQueueAttributeInput): boolean {
    return simSqsFifoEntries(requested).length === 0;
  }

  /**
   * A standard queue reports no FIFO attributes.
   */
  reportInto(): void {
    // Nothing to report.
  }
}

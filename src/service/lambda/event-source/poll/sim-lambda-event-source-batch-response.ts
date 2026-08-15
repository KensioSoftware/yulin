import type { SimSqsPollMessage } from "../../../sqs/poll/sim-sqs-poll-message.js";

/**
 * What became of one batch handed to a function.
 *
 * A batch is either deleted from the source or left on it to be delivered
 * again. Partial batch responses split it, which is the only reason this is a
 * pair of lists rather than a yes or no.
 */
export class SimLambdaEventSourceBatchOutcome {
  public readonly handled: readonly SimSqsPollMessage[];
  public readonly returned: readonly SimSqsPollMessage[];

  constructor(
    handled: readonly SimSqsPollMessage[],
    returned: readonly SimSqsPollMessage[],
  ) {
    this.handled = handled;
    this.returned = returned;
  }

  /**
   * The receipt handles of the messages to delete from the source.
   */
  get handledReceiptHandles(): readonly string[] {
    return this.handled.map((message) => message.ReceiptHandle);
  }

  /**
   * Whether anything was left behind to be delivered again.
   */
  get hasReturnedMessages(): boolean {
    return this.returned.length > 0;
  }
}

/**
 * Reads what a function said about the batch it was given.
 *
 * One per kind of event source, because what a function may say about a batch,
 * and what becomes of the part it did not handle, are the source's rules rather
 * than the delivery's.
 */
export interface SimLambdaEventSourceBatchResponse {
  /**
   * What became of a batch the function returned from.
   */
  handled(
    messages: readonly SimSqsPollMessage[],
    result: unknown,
  ): SimLambdaEventSourceBatchOutcome;

  /**
   * What becomes of a batch the function threw on.
   */
  failed(
    messages: readonly SimSqsPollMessage[],
  ): SimLambdaEventSourceBatchOutcome;
}

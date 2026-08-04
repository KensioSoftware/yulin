import type { SimLambdaEventSourceMessage } from "../queue/sim-lambda-event-source-queues.js";
import { SimLambdaBatchItemFailures } from "./sim-lambda-batch-item-failures.js";
import {
  SimLambdaEventSourceBatchOutcome,
  type SimLambdaEventSourceBatchResponse,
} from "./sim-lambda-event-source-batch-response.js";

/**
 * Reads what a function said about the batch of messages it was given.
 *
 * A function that returns normally has handled the whole batch, unless the
 * mapping was told to expect a batch item failure report and the function sent
 * one. A report naming an id that was not in the batch returns the whole batch,
 * as on real Lambda: the alternative is to guess which messages the function
 * meant, and guessing wrong loses a message.
 */
export class SimLambdaSqsBatchResponse implements SimLambdaEventSourceBatchResponse {
  private readonly batchItemFailures: SimLambdaBatchItemFailures;

  constructor(reportsBatchItemFailures: boolean) {
    this.batchItemFailures = new SimLambdaBatchItemFailures(
      reportsBatchItemFailures,
    );
  }

  /**
   * What became of a batch the function returned from.
   */
  handled(
    messages: readonly SimLambdaEventSourceMessage[],
    result: unknown,
  ): SimLambdaEventSourceBatchOutcome {
    const failedIds = this.batchItemFailures.idsIn(result);

    if (failedIds === undefined) {
      return new SimLambdaEventSourceBatchOutcome(messages, []);
    }

    if (!this.namesBatchMessages(failedIds, messages)) {
      return this.failed(messages);
    }

    return new SimLambdaEventSourceBatchOutcome(
      messages.filter((message) => !failedIds.includes(message.MessageId)),
      messages.filter((message) => failedIds.includes(message.MessageId)),
    );
  }

  /**
   * What becomes of a batch the function threw on: the whole of it goes back.
   */
  failed(
    messages: readonly SimLambdaEventSourceMessage[],
  ): SimLambdaEventSourceBatchOutcome {
    return new SimLambdaEventSourceBatchOutcome([], messages);
  }

  private namesBatchMessages(
    failedIds: readonly string[],
    messages: readonly SimLambdaEventSourceMessage[],
  ): boolean {
    return failedIds.every((failedId) =>
      messages.some((message) => message.MessageId === failedId),
    );
  }
}

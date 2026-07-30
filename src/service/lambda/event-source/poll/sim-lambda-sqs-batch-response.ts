import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimLambdaEventSourceMessage } from "../queue/sim-lambda-event-source-queues.js";

/**
 * What became of one batch handed to a function.
 *
 * A batch is either deleted from the queue or left on it to become visible
 * again. Partial batch responses split it, which is the only reason this is a
 * pair of lists rather than a yes or no.
 */
export class SimLambdaSqsBatchOutcome {
  public readonly handled: readonly SimLambdaEventSourceMessage[];
  public readonly returned: readonly SimLambdaEventSourceMessage[];

  constructor(
    handled: readonly SimLambdaEventSourceMessage[],
    returned: readonly SimLambdaEventSourceMessage[],
  ) {
    this.handled = handled;
    this.returned = returned;
  }

  /**
   * The receipt handles of the messages to delete from the queue.
   */
  get handledReceiptHandles(): readonly string[] {
    return this.handled.map((message) => message.ReceiptHandle);
  }

  /**
   * Whether anything was left on the queue to be delivered again.
   */
  get hasReturnedMessages(): boolean {
    return this.returned.length > 0;
  }
}

/**
 * Reads what a function said about the batch it was given.
 *
 * A function that returns normally has handled the whole batch, unless the
 * mapping was told to expect a batch item failure report and the function sent
 * one. A report naming an id that was not in the batch returns the whole batch,
 * as on real Lambda: the alternative is to guess which messages the function
 * meant, and guessing wrong loses a message.
 */
export class SimLambdaSqsBatchResponse {
  private readonly reportsBatchItemFailures: boolean;

  constructor(reportsBatchItemFailures: boolean) {
    this.reportsBatchItemFailures = reportsBatchItemFailures;
  }

  /**
   * What became of a batch the function returned from.
   */
  handled(
    messages: readonly SimLambdaEventSourceMessage[],
    result: unknown,
  ): SimLambdaSqsBatchOutcome {
    const failedIds = this.reportedFailureIds(result);

    if (failedIds === undefined) {
      return new SimLambdaSqsBatchOutcome(messages, []);
    }

    if (!this.namesBatchMessages(failedIds, messages)) {
      return this.failed(messages);
    }

    return new SimLambdaSqsBatchOutcome(
      messages.filter((message) => !failedIds.includes(message.MessageId)),
      messages.filter((message) => failedIds.includes(message.MessageId)),
    );
  }

  /**
   * What becomes of a batch the function threw on: the whole of it goes back.
   */
  failed(
    messages: readonly SimLambdaEventSourceMessage[],
  ): SimLambdaSqsBatchOutcome {
    return new SimLambdaSqsBatchOutcome([], messages);
  }

  /**
   * The message ids a batch item failure report names, or undefined when the
   * function reported none.
   */
  private reportedFailureIds(result: unknown): readonly string[] | undefined {
    if (!this.reportsBatchItemFailures || !isRecord(result)) {
      return undefined;
    }

    const reported = result["batchItemFailures"];

    if (!Array.isArray(reported) || reported.length === 0) {
      return undefined;
    }

    return reported.map((failure: unknown) => itemIdentifier(failure));
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

/**
 * The message id one reported failure names.
 *
 * An entry naming nothing is reported as an empty id, which no message has, so
 * the whole batch goes back. That is what real Lambda does with a malformed
 * report rather than dropping the entry.
 */
function itemIdentifier(failure: unknown): string {
  if (!isRecord(failure)) {
    return "";
  }

  const identifier = failure["itemIdentifier"];

  if (typeof identifier !== "string") {
    return "";
  }

  return identifier;
}

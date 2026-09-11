import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimSqsPollMessage } from "../../../sqs/poll/sim-sqs-poll-message.js";
import {
  SimLambdaEventSourceBatchOutcome,
  type SimLambdaEventSourceBatchResponse,
} from "./sim-lambda-event-source-batch-response.js";
import type { SimLambdaFilterCriteria } from "../filter/sim-lambda-filter-criteria.js";
import { simLambdaFilteredDelivery } from "../filter/sim-lambda-filtered-delivery.js";

/**
 * One record of an event source event.
 *
 * Every source's records name where they came from, whatever else they carry,
 * which is as much as delivery needs to know about the shape.
 */
export interface SimLambdaEventSourceEventRecord {
  readonly eventSource: string;
  readonly eventSourceARN: string;
}

/**
 * The event one batch is delivered as.
 */
export interface SimLambdaEventSourceEvent {
  readonly Records: readonly SimLambdaEventSourceEventRecord[];
}

/**
 * Builds the event a batch is handed to the function as.
 *
 * The shape is the event source's own, so the poller that made the delivery
 * decides which builder it gets.
 */
export interface SimLambdaEventSourceEventBuilder {
  of(messages: readonly SimSqsPollMessage[]): SimLambdaEventSourceEvent;

  /**
   * What a mapping's filters read one message as, which is the source's own
   * translation.
   */
  filterDocumentOf(message: SimSqsPollMessage): Record<string, unknown>;
}

interface SimLambdaEventSourceDeliveryProperties {
  readonly eventBuilder: SimLambdaEventSourceEventBuilder;
  readonly batchResponse: SimLambdaEventSourceBatchResponse;
  readonly filterCriteria: SimLambdaFilterCriteria | undefined;
}

/**
 * Hands one batch to a function and reads what became of it.
 *
 * The batch is invoked directly rather than through the Invoke command because
 * the handler's error has to be seen: an asynchronous invocation drops it, and
 * this is what decides whether the messages go back on the source.
 *
 * What the event looks like and what a return value means are the source's
 * business, so both are handed in rather than built here.
 */
export class SimLambdaEventSourceDelivery {
  private readonly eventBuilder: SimLambdaEventSourceEventBuilder;
  private readonly batchResponse: SimLambdaEventSourceBatchResponse;
  private readonly filterCriteria: SimLambdaFilterCriteria | undefined;

  constructor(properties: SimLambdaEventSourceDeliveryProperties) {
    this.eventBuilder = properties.eventBuilder;
    this.batchResponse = properties.batchResponse;
    this.filterCriteria = properties.filterCriteria;
  }

  /**
   * Deliver a batch, answering with what to delete and what to leave.
   */
  async to(
    simFunction: SimLambdaFunction,
    messages: readonly SimSqsPollMessage[],
  ): Promise<SimLambdaEventSourceBatchOutcome> {
    return await simLambdaFilteredDelivery({
      criteria: this.filterCriteria,
      records: messages,
      documentOf: (message) => this.eventBuilder.filterDocumentOf(message),
      // A message the filters excluded is deleted from the queue without the
      // function seeing it, the way real Lambda deletes one.
      handled: () => new SimLambdaEventSourceBatchOutcome(messages, []),
      invoke: async (delivered) =>
        this.alsoHandling(messages, await this.invoked(simFunction, delivered)),
    });
  }

  /**
   * One batch of matching messages, handed over and read back.
   */
  private async invoked(
    simFunction: SimLambdaFunction,
    delivered: readonly SimSqsPollMessage[],
  ): Promise<SimLambdaEventSourceBatchOutcome> {
    try {
      return this.batchResponse.handled(
        delivered,
        await simFunction.invoke(this.eventBuilder.of(delivered)),
      );
    } catch {
      // As on real Lambda, the handler error goes to the function's logs and
      // not to whoever sent the message. What the sender sees is the batch
      // coming back to the source.
      return this.batchResponse.failed(delivered);
    }
  }

  /**
   * An outcome with the filtered-out messages counted as handled, which deletes
   * them whatever the function said about the rest.
   *
   * A message the function never saw is in neither list the outcome carries,
   * which is what picks it out of the batch that was read.
   */
  private alsoHandling(
    messages: readonly SimSqsPollMessage[],
    outcome: SimLambdaEventSourceBatchOutcome,
  ): SimLambdaEventSourceBatchOutcome {
    const seen = new Set([...outcome.handled, ...outcome.returned]);
    const excluded = messages.filter((message) => !seen.has(message));

    return new SimLambdaEventSourceBatchOutcome(
      [...outcome.handled, ...excluded],
      outcome.returned,
    );
  }
}

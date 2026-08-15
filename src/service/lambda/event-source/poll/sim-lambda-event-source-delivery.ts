import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimSqsPollMessage } from "../../../sqs/poll/sim-sqs-poll-message.js";
import type {
  SimLambdaEventSourceBatchOutcome,
  SimLambdaEventSourceBatchResponse,
} from "./sim-lambda-event-source-batch-response.js";

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
}

interface SimLambdaEventSourceDeliveryProperties {
  readonly eventBuilder: SimLambdaEventSourceEventBuilder;
  readonly batchResponse: SimLambdaEventSourceBatchResponse;
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

  constructor(properties: SimLambdaEventSourceDeliveryProperties) {
    this.eventBuilder = properties.eventBuilder;
    this.batchResponse = properties.batchResponse;
  }

  /**
   * Deliver a batch, answering with what to delete and what to leave.
   */
  async to(
    simFunction: SimLambdaFunction,
    messages: readonly SimSqsPollMessage[],
  ): Promise<SimLambdaEventSourceBatchOutcome> {
    try {
      return this.batchResponse.handled(
        messages,
        await simFunction.invoke(this.eventBuilder.of(messages)),
      );
    } catch {
      // As on real Lambda, the handler error goes to the function's logs and
      // not to whoever sent the message. What the sender sees is the batch
      // coming back to the source.
      return this.batchResponse.failed(messages);
    }
  }
}

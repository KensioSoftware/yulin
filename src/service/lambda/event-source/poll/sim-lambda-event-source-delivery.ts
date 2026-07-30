import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceMessage } from "../queue/sim-lambda-event-source-queues.js";
import type { SimLambdaSqsEventSourceArn } from "../queue/sim-lambda-sqs-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import {
  type SimLambdaSqsBatchOutcome,
  SimLambdaSqsBatchResponse,
} from "./sim-lambda-sqs-batch-response.js";
import { SimLambdaSqsEventBuilder } from "./sim-lambda-sqs-event.js";

interface SimLambdaEventSourceDeliveryProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaSqsEventSourceArn;
}

/**
 * Hands one batch to a function and reads what became of it.
 *
 * The batch is invoked directly rather than through the Invoke command because
 * the handler's error has to be seen: an asynchronous invocation drops it, and
 * this is what decides whether the messages go back on the queue.
 */
export class SimLambdaEventSourceDelivery {
  private readonly eventBuilder: SimLambdaSqsEventBuilder;
  private readonly batchResponse: SimLambdaSqsBatchResponse;

  constructor(properties: SimLambdaEventSourceDeliveryProperties) {
    this.eventBuilder = new SimLambdaSqsEventBuilder(properties.eventSourceArn);
    this.batchResponse = new SimLambdaSqsBatchResponse(
      properties.mapping.reportsBatchItemFailures,
    );
  }

  /**
   * Deliver a batch, answering with what to delete and what to leave.
   */
  async to(
    simFunction: SimLambdaFunction,
    messages: readonly SimLambdaEventSourceMessage[],
  ): Promise<SimLambdaSqsBatchOutcome> {
    try {
      return this.batchResponse.handled(
        messages,
        await simFunction.invoke(this.eventBuilder.of(messages)),
      );
    } catch {
      // As on real Lambda, the handler error goes to the function's logs and
      // not to whoever sent the message. What the sender sees is the batch
      // coming back to the queue.
      return this.batchResponse.failed(messages);
    }
  }
}

import type { SimLambdaSqsEventSourceArn } from "../queue/sim-lambda-sqs-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import { SimLambdaEventSourceDelivery } from "./sim-lambda-event-source-delivery.js";
import { SimLambdaSqsBatchResponse } from "./sim-lambda-sqs-batch-response.js";
import { SimLambdaSqsEventBuilder } from "./sim-lambda-sqs-event.js";

interface SimLambdaSqsDeliveryProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaSqsEventSourceArn;
}

/**
 * The delivery an SQS mapping hands its batches over with.
 *
 * What the event looks like and what the function's return value means are both
 * the queue's, so they are put together here and handed to the delivery, which
 * knows neither.
 */
export function makeSimLambdaSqsDelivery(
  properties: SimLambdaSqsDeliveryProperties,
): SimLambdaEventSourceDelivery {
  return new SimLambdaEventSourceDelivery({
    eventBuilder: new SimLambdaSqsEventBuilder(properties.eventSourceArn),
    batchResponse: new SimLambdaSqsBatchResponse(
      properties.mapping.reportsBatchItemFailures,
    ),
  });
}

import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceQueues } from "../queue/sim-lambda-event-source-queues.js";
import type { SimLambdaEventSourceArn } from "../sim-lambda-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceStreams } from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaDynamoDbStreamEventSourcePoller } from "./sim-lambda-dynamodb-stream-event-source-poller.js";
import type { SimLambdaEventSourcePoller } from "./sim-lambda-event-source-poller.js";
import { SimLambdaSqsEventSourcePoller } from "./sim-lambda-sqs-event-source-poller.js";

export interface SimLambdaEventSourcePollerProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaEventSourceArn;
  readonly functions: SimLambdaFunctionLookup;
  readonly queues: SimLambdaEventSourceQueues;
  readonly streams: SimLambdaEventSourceStreams;
  readonly background: BackgroundScheduler;
}

/**
 * The poller for the kind of event source a mapping names.
 *
 * Which poller a mapping gets is decided here rather than by whoever starts
 * one, so adding a kind of source is a change here rather than a change to
 * everything a poller touches. Each poller only accepts the ARN of the source
 * it polls, so a source given to the wrong one fails to compile here rather
 * than being polled as something it is not.
 */
export function makeSimLambdaEventSourcePoller(
  properties: SimLambdaEventSourcePollerProperties,
): SimLambdaEventSourcePoller {
  const { eventSourceArn } = properties;

  switch (eventSourceArn.kind) {
    case "sqs": {
      return new SimLambdaSqsEventSourcePoller({
        ...properties,
        eventSourceArn,
      });
    }

    case "dynamodb-stream": {
      return new SimLambdaDynamoDbStreamEventSourcePoller({
        ...properties,
        eventSourceArn,
      });
    }
  }
}

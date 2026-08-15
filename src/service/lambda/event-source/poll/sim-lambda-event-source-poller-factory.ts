import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimSqsPollQueues } from "../../../sqs/poll/sim-sqs-poll-queues.js";
import type { SimLambdaEventSourceArn } from "../sim-lambda-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceStreams } from "../stream/sim-lambda-event-source-streams.js";
import { SimSqsQueuePoller } from "../../../sqs/poll/sim-sqs-queue-poller.js";
import { SimLambdaDynamoDbStreamEventSourcePoller } from "./sim-lambda-dynamodb-stream-event-source-poller.js";
import type { SimLambdaEventSourcePoller } from "./sim-lambda-event-source-poller.js";
import { SimLambdaSqsEventSourceConsumer } from "./sim-lambda-sqs-event-source-consumer.js";

export interface SimLambdaEventSourcePollerProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaEventSourceArn;
  readonly functions: SimLambdaFunctionLookup;
  readonly queues: SimSqsPollQueues;
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
      // The queue poller is the shared one, so a mapping polls its queue the
      // way a long-running ECS container polls one: what the mapping supplies
      // is the consumer behind it.
      return new SimSqsQueuePoller({
        queues: properties.queues,
        queueArn: eventSourceArn.value,
        background: properties.background,
        consumer: new SimLambdaSqsEventSourceConsumer({
          ...properties,
          eventSourceArn,
        }),
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

import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceQueues } from "../queue/sim-lambda-event-source-queues.js";
import type { SimLambdaEventSourceArn } from "../sim-lambda-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourcePoller } from "./sim-lambda-event-source-poller.js";
import { SimLambdaSqsEventSourcePoller } from "./sim-lambda-sqs-event-source-poller.js";

export interface SimLambdaEventSourcePollerProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaEventSourceArn;
  readonly functions: SimLambdaFunctionLookup;
  readonly queues: SimLambdaEventSourceQueues;
  readonly background: BackgroundScheduler;
}

/**
 * The poller for the kind of event source a mapping names.
 *
 * Which poller a mapping gets is decided here rather than by whoever starts
 * one, so adding a kind of source is a change here rather than a change to
 * everything a poller touches. There is one kind so far, so this hands the ARN
 * straight to the queue poller: the queue poller only accepts a queue ARN, so a
 * second kind of source fails to compile here rather than being polled as a
 * queue.
 */
export function makeSimLambdaEventSourcePoller(
  properties: SimLambdaEventSourcePollerProperties,
): SimLambdaEventSourcePoller {
  const { eventSourceArn } = properties;

  return new SimLambdaSqsEventSourcePoller({ ...properties, eventSourceArn });
}

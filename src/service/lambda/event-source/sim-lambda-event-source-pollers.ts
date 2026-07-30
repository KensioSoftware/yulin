import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimLambdaFunctionLookup } from "../function/url/sim-lambda-function-lookup.js";
import { SimLambdaEventSourcePoller } from "./poll/sim-lambda-event-source-poller.js";
import type { SimLambdaEventSourceQueues } from "./queue/sim-lambda-event-source-queues.js";
import type { SimLambdaSqsEventSourceArn } from "./queue/sim-lambda-sqs-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "./sim-lambda-event-source-mapping.js";

interface SimLambdaEventSourcePollersProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly queues: SimLambdaEventSourceQueues;
  readonly background: BackgroundScheduler;
}

/**
 * The pollers of one simulated Lambda scope, one for each event source mapping.
 *
 * A mapping is state a request can read; a poller is the running thing behind
 * it. They are kept apart so the mapping stays what Get and List report, and so
 * deleting a mapping has somewhere to stop the polling.
 */
export class SimLambdaEventSourcePollers {
  private readonly pollers = new Map<string, SimLambdaEventSourcePoller>();
  private readonly properties: SimLambdaEventSourcePollersProperties;

  constructor(properties: SimLambdaEventSourcePollersProperties) {
    this.properties = properties;
  }

  /**
   * Start polling for a newly created mapping.
   *
   * The mapping finishes creating in the background, as it does on real Lambda,
   * and starts polling once it does. Whatever is already on the queue is polled
   * for then, because real Lambda does not only deliver what arrives after the
   * mapping was made.
   */
  start(
    mapping: SimLambdaEventSourceMapping,
    eventSourceArn: SimLambdaSqsEventSourceArn,
  ): void {
    const poller = new SimLambdaEventSourcePoller({
      ...this.properties,
      mapping,
      eventSourceArn,
    });

    this.pollers.set(mapping.uuid, poller);
    poller.watch();

    this.properties.background.schedule(async () => {
      await mapping.activate();
      poller.pollNow();
    });
  }

  /**
   * Stop polling for a deleted mapping.
   */
  stop(mapping: SimLambdaEventSourceMapping): void {
    this.pollers.get(mapping.uuid)?.stop();
    this.pollers.delete(mapping.uuid);
  }
}

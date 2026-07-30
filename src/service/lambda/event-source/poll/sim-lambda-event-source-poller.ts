import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type {
  SimLambdaEventSourceQueueRequest,
  SimLambdaEventSourceQueues,
  SimLambdaEventSourceQueueWatcher,
} from "../queue/sim-lambda-event-source-queues.js";
import type { SimLambdaSqsEventSourceArn } from "../queue/sim-lambda-sqs-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import { SimLambdaEventSourceDelivery } from "./sim-lambda-event-source-delivery.js";
import { SimLambdaEventSourcePollSchedule } from "./sim-lambda-event-source-poll-schedule.js";
import type { SimLambdaSqsBatchOutcome } from "./sim-lambda-sqs-batch-response.js";

interface SimLambdaEventSourcePollerProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaSqsEventSourceArn;
  readonly functions: SimLambdaFunctionLookup;
  readonly queues: SimLambdaEventSourceQueues;
  readonly background: BackgroundScheduler;
}

/**
 * Polls one event source mapping's queue and invokes its function.
 *
 * Real Lambda polls a queue continuously. Nothing in this simulation runs
 * continuously, so the queue says when a message has arrived and a poll is
 * scheduled in response. A test that awaits the simulation settling has
 * therefore watched the whole delivery happen, rather than having waited a
 * while and hoped.
 *
 * A batch the function returns from is deleted from the queue. A batch it
 * throws on is left there, which hides it for the visibility timeout and hands
 * it back afterwards, so a redrive policy eventually gives up on it exactly as
 * it would for any other failing consumer. That is why the poller invokes the
 * function directly rather than through the Invoke command: an asynchronous
 * invocation drops its handler error, and this one has to be seen.
 */
export class SimLambdaEventSourcePoller implements SimLambdaEventSourceQueueWatcher {
  private readonly properties: SimLambdaEventSourcePollerProperties;
  private readonly delivery: SimLambdaEventSourceDelivery;
  private readonly schedule: SimLambdaEventSourcePollSchedule;

  private stopped = false;

  constructor(properties: SimLambdaEventSourcePollerProperties) {
    this.properties = properties;
    this.delivery = new SimLambdaEventSourceDelivery(properties);
    this.schedule = new SimLambdaEventSourcePollSchedule({
      background: properties.background,
      poll: async (): Promise<void> => {
        await this.run();
      },
    });
  }

  /**
   * Watch the queue this mapping polls.
   *
   * Watching starts as soon as the mapping is created, before it has finished
   * creating, so a message sent in between is not missed. The poll it wakes
   * finds a mapping that is not polling yet and does nothing, and the poll that
   * follows activation picks the message up.
   */
  watch(): void {
    this.properties.queues.watch(this.properties.eventSourceArn.value, this);
  }

  /**
   * Poll as soon as the simulation gets to it, which is what a newly enabled
   * mapping does with whatever is already on its queue.
   */
  pollNow(): void {
    this.schedule.now();
  }

  /**
   * Stop polling, as deleting the mapping does.
   */
  stop(): void {
    this.stopped = true;
    this.properties.queues.unwatch(this.properties.eventSourceArn.value, this);
  }

  /**
   * Take a message arriving on the queue as something to poll for.
   */
  messageAvailable(availableFrom: Date): void {
    this.schedule.at(availableFrom);
  }

  /**
   * Poll once: one batch, delivered and then deleted or left behind.
   */
  private async run(): Promise<void> {
    const simFunction = this.pollingFunction();

    if (simFunction === undefined) {
      return;
    }

    // Polling is done as the function's execution role, as on real Lambda, so
    // simulated IAM decides whether this mapping may read its queue.
    const request = {
      queueArn: this.properties.eventSourceArn.value,
      caller: { kind: "arn", arn: simFunction.roleArn },
    } as const satisfies SimLambdaEventSourceQueueRequest;
    const visibilityTimeoutSeconds =
      await this.properties.queues.visibilityTimeoutSeconds(request);
    const messages = await this.properties.queues.receive({
      ...request,
      batchSize: this.properties.mapping.batchSize,
    });

    if (messages.length === 0) {
      return;
    }

    const outcome = await this.delivery.to(simFunction, messages);

    await this.properties.queues.deleteMessages({
      ...request,
      receiptHandles: outcome.handledReceiptHandles,
    });

    this.pollAgainAfter(outcome, messages.length, visibilityTimeoutSeconds);
  }

  /**
   * The function this mapping delivers to, while it should be delivering.
   *
   * A mapping still being created is not polling yet, and a disabled one never
   * is. A function that is not there is not an error here: the mapping simply
   * has nothing to deliver to.
   */
  private pollingFunction(): SimLambdaFunction | undefined {
    if (this.stopped || !this.properties.mapping.isPolling) {
      return undefined;
    }

    return this.properties.functions.find(this.properties.mapping.functionName);
  }

  /**
   * Decide when this mapping polls again: when a returned batch becomes
   * visible again, or straight away when a batch filled the request and there
   * may be more waiting.
   */
  private pollAgainAfter(
    outcome: SimLambdaSqsBatchOutcome,
    receivedCount: number,
    visibilityTimeoutSeconds: number,
  ): void {
    if (outcome.hasReturnedMessages) {
      this.schedule.afterSeconds(visibilityTimeoutSeconds);

      return;
    }

    if (receivedCount >= this.properties.mapping.batchSize) {
      this.schedule.now();
    }
  }
}

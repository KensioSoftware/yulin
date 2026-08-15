import type { SimSqsPollMessage } from "../../../sqs/poll/sim-sqs-poll-message.js";
import type {
  SimSqsPollConsumer,
  SimSqsPollOutcome,
  SimSqsPollSession,
} from "../../../sqs/poll/sim-sqs-queue-poller.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaSqsEventSourceArn } from "../queue/sim-lambda-sqs-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceDelivery } from "./sim-lambda-event-source-delivery.js";
import { makeSimLambdaSqsDelivery } from "./sim-lambda-sqs-delivery.js";

interface SimLambdaSqsEventSourceConsumerProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaSqsEventSourceArn;
  readonly functions: SimLambdaFunctionLookup;
}

/**
 * One event source mapping as the thing consuming its queue.
 *
 * The polling is the shared queue poller's, which every simulated consumer of a
 * queue uses. What a mapping adds is what a batch is handed to and as whom: the
 * function it names, invoked directly rather than through the Invoke command
 * because the handler's error has to be seen. An asynchronous invocation drops
 * it, and it is what decides whether the batch goes back on the queue.
 */
export class SimLambdaSqsEventSourceConsumer implements SimSqsPollConsumer {
  private readonly mapping: SimLambdaEventSourceMapping;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly delivery: SimLambdaEventSourceDelivery;

  constructor(properties: SimLambdaSqsEventSourceConsumerProperties) {
    this.mapping = properties.mapping;
    this.functions = properties.functions;
    this.delivery = makeSimLambdaSqsDelivery(properties);
  }

  /**
   * What this mapping's next poll delivers to, while it should be delivering.
   *
   * A mapping still being created is not polling yet, and a disabled one never
   * is. A function that is not there is not an error here: the mapping simply
   * has nothing to deliver to.
   *
   * Polling is done as the function's execution role, as on real Lambda, so
   * simulated IAM decides whether this mapping may read its queue.
   */
  session(): SimSqsPollSession | undefined {
    const simFunction = this.pollingFunction();

    if (simFunction === undefined) {
      return undefined;
    }

    return {
      caller: { kind: "arn", arn: simFunction.roleArn },
      batchSize: this.mapping.batchSize,
      handle: async (
        messages: readonly SimSqsPollMessage[],
      ): Promise<SimSqsPollOutcome> =>
        await this.delivery.to(simFunction, messages),
    };
  }

  private pollingFunction(): SimLambdaFunction | undefined {
    if (!this.mapping.isPolling) {
      return undefined;
    }

    return this.functions.find(this.mapping.functionName);
  }
}

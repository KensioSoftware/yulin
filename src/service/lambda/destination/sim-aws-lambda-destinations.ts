import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { SimLambdaDestinationBus } from "./deliver/sim-lambda-destination-bus.js";
import { SimLambdaDestinationFunction } from "./deliver/sim-lambda-destination-function.js";
import { SimLambdaDestinationQueue } from "./deliver/sim-lambda-destination-queue.js";
import type { SimLambdaDestinationSend } from "./deliver/sim-lambda-destination-send.js";
import { SimLambdaDestinationTopic } from "./deliver/sim-lambda-destination-topic.js";
import type { SimLambdaDestinationArn } from "./sim-lambda-destination-arn.js";
import type {
  SimLambdaDeadLetterRequest,
  SimLambdaDestinationDeliveryRequest,
  SimLambdaDestinationTargets,
} from "./sim-lambda-destination-targets.js";

interface SimAwsLambdaDestinationsProperties {
  readonly simAws: SimAws;
}

/**
 * Everywhere the functions of one simulated AWS instance send their
 * asynchronous invocation results.
 *
 * The destination is looked up when a result is delivered, never when this is
 * built: reaching another service while this one is being constructed is a
 * cycle with no bottom to it.
 *
 * Real Lambda delivers under the function's own execution role, and delivers
 * nothing when that role cannot write to the destination. The permission is
 * left unchecked here, so a delivery is made as the destination Account's own
 * root. A record that silently goes nowhere is the harder failure to find, and
 * a destination needs no resource policy on real AWS either, so nothing about
 * the destination itself has to be set up for a record to arrive.
 */
export class SimAwsLambdaDestinations implements SimLambdaDestinationTargets {
  private readonly simAws: SimAws;
  private readonly queue = new SimLambdaDestinationQueue();
  private readonly topic = new SimLambdaDestinationTopic();

  constructor(properties: SimAwsLambdaDestinationsProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Send one invocation record to the destination its ARN names.
   */
  async deliver(request: SimLambdaDestinationDeliveryRequest): Promise<void> {
    const { destinationArn: arn } = request;
    const scope = this.scopeOf(arn);

    switch (arn.service) {
      case "sqs": {
        await this.queue.deliver(this.send(request));
        return;
      }
      case "sns": {
        await this.topic.deliver(this.send(request));
        return;
      }
      case "events": {
        await new SimLambdaDestinationBus().deliver(scope, request);
        return;
      }
      case "lambda": {
        await new SimLambdaDestinationFunction().deliver(scope, request);
        return;
      }
    }
  }

  /**
   * Send one abandoned event to a dead-letter queue or topic.
   */
  async deadLetter(request: SimLambdaDeadLetterRequest): Promise<void> {
    const send: SimLambdaDestinationSend = {
      scope: this.scopeOf(request.targetArn),
      arn: request.targetArn,
      body: JSON.stringify(request.payload),
      sourceFunctionArn: request.sourceFunctionArn,
    };

    await (request.targetArn.service === "sqs"
      ? this.queue.deliver(send)
      : this.topic.deliver(send));
  }

  private send(
    request: SimLambdaDestinationDeliveryRequest,
  ): SimLambdaDestinationSend {
    return {
      scope: this.scopeOf(request.destinationArn),
      arn: request.destinationArn,
      body: JSON.stringify(request.record),
      sourceFunctionArn: request.sourceFunctionArn,
    };
  }

  private scopeOf(arn: SimLambdaDestinationArn): SimAwsAccountRegionContainer {
    return this.simAws.accountRegionScope(arn.accountId, arn.regionName);
  }
}

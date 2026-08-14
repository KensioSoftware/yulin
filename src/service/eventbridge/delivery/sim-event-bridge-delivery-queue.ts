import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { SimSqsServiceSendAuthorizer } from "../../sqs/command/authorize/sim-sqs-service-send-authorizer.js";
import {
  SimEventBridgeDeliveryNotPermitted,
  SimEventBridgeTargetNotFound,
} from "../error/sim-event-bridge-delivery.error.js";
import {
  type SimEventBridgeDeliveryRequest,
  simEventBridgeDeliveryJson,
  simEventBridgeDeliverySource,
  simEventBridgeServicePrincipal,
} from "./sim-event-bridge-delivery.js";

interface SimEventBridgeDeliveryQueueProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * A queue a simulated rule is sending an event to, in the Account and Region
 * the target ARN names.
 *
 * The message body is the event, as JSON. Real EventBridge puts the event
 * itself on the queue rather than wrapping it in an envelope of its own, which
 * is what makes a queue target simpler to consume than an SNS subscription.
 */
export class SimEventBridgeDeliveryQueue {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimEventBridgeDeliveryQueueProperties) {
    this.scope = properties.scope;
  }

  /**
   * Put the event on the queue, if it admits EventBridge for this rule.
   */
  async deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    const source = simEventBridgeDeliverySource(request);
    const targetArn = request.target.arn;
    const queue = this.scope.sqs().findQueue(targetArn.resource);

    if (queue === undefined) {
      throw new SimEventBridgeTargetNotFound(
        `${targetArn.value} is not a simulated SQS queue.`,
      );
    }

    const decision = new SimSqsServiceSendAuthorizer({
      iam: this.scope.iam(),
    }).authorize({
      queue,
      servicePrincipal: simEventBridgeServicePrincipal,
      ...source,
    });

    if (decision.isDenied) {
      throw new SimEventBridgeDeliveryNotPermitted(
        `The queue policy of ${targetArn.value} does not allow ` +
          `${simEventBridgeServicePrincipal} to send to it for ` +
          `${source.sourceArn}. Grant sqs:SendMessage with the queue's ` +
          `Policy attribute.`,
      );
    }

    // Sent through the ordinary SendMessage path, so a delivered event is the
    // same thing an SDK caller would have sent, and is authorized again on the
    // way in.
    await this.scope.sqs().sendMessage(
      {
        input: {
          QueueUrl: queue.arn.url,
          MessageBody: simEventBridgeDeliveryJson(request),
        },
      },
      {
        caller: {
          kind: "service",
          service: simEventBridgeServicePrincipal,
        },
        ...source,
      },
    );
  }
}

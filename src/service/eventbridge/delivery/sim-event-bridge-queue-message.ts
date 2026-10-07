import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";
import { SimSqsServiceSendAuthorizer } from "../../sqs/command/authorize/sim-sqs-service-send-authorizer.js";
import {
  SimEventBridgeDeliveryNotPermitted,
  SimEventBridgeTargetNotFound,
} from "../error/sim-event-bridge-delivery.error.js";
import {
  type SimEventBridgeDeliverySource,
  simEventBridgeServicePrincipal,
} from "./sim-event-bridge-delivery.js";

/**
 * One SQS message attribute, as SendMessage takes it.
 */
export interface SimEventBridgeStringAttribute {
  readonly DataType: string;
  readonly StringValue: string;
}

/**
 * One message EventBridge sends to a queue, and the queue it is for.
 */
export interface SimEventBridgeQueueMessage {
  readonly queueName: string;
  readonly queueArn: string;
  readonly body: string;
  readonly attributes?: Readonly<Record<string, SimEventBridgeStringAttribute>>;
  readonly source: SimEventBridgeDeliverySource;
}

/**
 * Send a message to a queue as EventBridge, if the queue admits it for the
 * rule.
 *
 * A target queue and a dead-letter queue are reached the same way. Both are
 * sent to as `events.amazonaws.com`, and both need the queue policy to admit
 * that principal for the rule.
 */
export async function sendEventBridgeQueueMessage(
  scope: SimAwsAccountRegionContainer,
  message: SimEventBridgeQueueMessage,
): Promise<void> {
  const { queueArn, source } = message;
  const queue = scope.sqs().findQueue(message.queueName);

  if (queue === undefined) {
    throw new SimEventBridgeTargetNotFound(
      `${queueArn} is not a simulated SQS queue.`,
    );
  }

  const decision = new SimSqsServiceSendAuthorizer({
    iam: simScopeIamAuthZ(scope),
  }).authorize({
    queue,
    servicePrincipal: simEventBridgeServicePrincipal,
    ...source,
  });

  if (decision.isDenied) {
    throw new SimEventBridgeDeliveryNotPermitted(
      `The queue policy of ${queueArn} does not allow ` +
        `${simEventBridgeServicePrincipal} to send to it for ` +
        `${source.sourceArn}. Grant sqs:SendMessage with the queue's ` +
        `Policy attribute.`,
    );
  }

  // Sent through the ordinary SendMessage path, so a delivered event is the
  // same thing an SDK caller would have sent, and is authorized again on the
  // way in.
  await scope.sqs().sendMessage(
    {
      input: {
        QueueUrl: queue.arn.url,
        MessageBody: message.body,
        MessageAttributes: message.attributes,
      },
    },
    {
      caller: { kind: "service", service: simEventBridgeServicePrincipal },
      ...source,
    },
  );
}

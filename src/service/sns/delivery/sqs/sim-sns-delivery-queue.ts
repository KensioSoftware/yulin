import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import { SimSqsServiceSendAuthorizer } from "../../../sqs/command/authorize/sim-sqs-service-send-authorizer.js";
import { SimSnsDeliveryNotPermitted } from "../../error/sim-sns-delivery.error.js";
import { SimSnsNotFoundException } from "../../error/sim-sns.error.js";
import type { SimSnsQueueEndpointArn } from "../../subscription/sim-sns-queue-endpoint-arn.js";
import {
  type SimSnsDeliveryRequest,
  simSnsServicePrincipal,
} from "../sim-sns-delivery.js";

interface SimSnsDeliveryQueueProperties {
  readonly arn: SimSnsQueueEndpointArn;
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * One queue a simulated topic is delivering to, in the Account and Region its
 * ARN names.
 *
 * Everything is asked of the queue's own Account, which is what makes a queue
 * in another Account reachable: its policy is the grant, and its Account's IAM
 * is what evaluates it.
 */
export class SimSnsDeliveryQueue {
  private readonly arn: SimSnsQueueEndpointArn;
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimSnsDeliveryQueueProperties) {
    this.arn = properties.arn;
    this.scope = properties.scope;
  }

  /**
   * Put one message on the queue, if it admits SNS for this topic.
   *
   * The queue policy is consulted on every delivery rather than remembered
   * from the moment the subscription was made, so a permission taken away
   * afterwards stops delivery. Real SNS does not check it at `Subscribe` time
   * at all, which is why this is the only place it is asked.
   */
  async deliver(request: SimSnsDeliveryRequest): Promise<void> {
    const queue = this.scope.sqs().findQueue(this.arn.queueName);

    if (queue === undefined) {
      // Not a refusal: the queue policy said nothing, because there is no
      // queue. A subscription pointing at nothing is a mistake worth warning
      // about, where a policy saying no is a modelled outcome a test may be
      // asking for on purpose.
      throw new SimSnsNotFoundException(
        `${request.endpointArn} is not a simulated SQS queue.`,
      );
    }

    const decision = new SimSqsServiceSendAuthorizer({
      iam: this.scope.iam(),
    }).authorize({
      queue,
      servicePrincipal: simSnsServicePrincipal,
      sourceArn: request.topicArn,
      sourceAccount: request.topicOwnerAccountId,
    });

    if (decision.isDenied) {
      throw new SimSnsDeliveryNotPermitted(
        `The queue policy of ${request.endpointArn} does not allow ` +
          `${simSnsServicePrincipal} to send to it for ${request.topicArn}. ` +
          "Grant sqs:SendMessage with the queue's Policy attribute.",
      );
    }

    await this.send(request);
  }

  /**
   * Send the message through the ordinary SendMessage path.
   *
   * A delivered message is therefore the same thing an SDK caller would have
   * sent, and is authorized again on the way in.
   */
  private async send(request: SimSnsDeliveryRequest): Promise<void> {
    await this.scope.sqs().sendMessage(
      {
        input: {
          QueueUrl: this.arn.queueUrl,
          MessageBody: request.body,
          ...(request.messageAttributes !== undefined && {
            MessageAttributes: request.messageAttributes,
          }),
        },
      },
      {
        caller: { kind: "service", service: simSnsServicePrincipal },
        sourceArn: request.topicArn,
        sourceAccount: request.topicOwnerAccountId,
      },
    );
  }
}

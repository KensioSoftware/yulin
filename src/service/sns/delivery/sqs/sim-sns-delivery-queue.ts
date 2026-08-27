import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import { SimSqsServiceSendAuthorizer } from "../../../sqs/command/authorize/sim-sqs-service-send-authorizer.js";
import { SimSnsDeliveryNotPermitted } from "../../error/sim-sns-delivery.error.js";
import { SimSnsNotFoundException } from "../../error/sim-sns.error.js";
import type { SimSnsQueueEndpointArn } from "../../subscription/sim-sns-queue-endpoint-arn.js";
import {
  type SimSnsDeliveryRequest,
  simSnsDeliverySource,
  simSnsServicePrincipal,
} from "../sim-sns-delivery.js";
import { SimSnsQueueMessage } from "./sim-sns-queue-message.js";
import { simScopeIamAuthZ } from "../../../iam/authorize/sim-iam-region-auth-z.js";

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
    const source = simSnsDeliverySource(request);
    const endpointArn = request.subscription.endpoint.value;
    const queue = this.scope.sqs().findQueue(this.arn.queueName);

    if (queue === undefined) {
      // Not a refusal: the queue policy said nothing, because there is no
      // queue. A subscription pointing at nothing is a mistake worth warning
      // about, where a policy saying no is a modelled outcome a test may be
      // asking for on purpose.
      throw new SimSnsNotFoundException(
        `${endpointArn} is not a simulated SQS queue.`,
      );
    }

    const decision = new SimSqsServiceSendAuthorizer({
      iam: simScopeIamAuthZ(this.scope),
    }).authorize({
      queue,
      servicePrincipal: simSnsServicePrincipal,
      ...source,
    });

    if (decision.isDenied) {
      throw new SimSnsDeliveryNotPermitted(
        `The queue policy of ${endpointArn} does not allow ` +
          `${simSnsServicePrincipal} to send to it for ${source.sourceArn}. ` +
          "Grant sqs:SendMessage with the queue's Policy attribute.",
      );
    }

    // Sent through the ordinary SendMessage path, so a delivered message is
    // the same thing an SDK caller would have sent, and is authorized again on
    // the way in.
    await this.scope.sqs().sendMessage(
      {
        input: new SimSnsQueueMessage(request).sendMessageInput(
          this.arn.queueUrl,
        ),
      },
      {
        caller: { kind: "service", service: simSnsServicePrincipal },
        ...source,
      },
    );
  }
}

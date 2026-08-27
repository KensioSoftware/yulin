import type { SimAwsAccountRegionContainer } from "../../../../aws/sim-aws-account-region-scope.js";
import { SimSqsServiceSendAuthorizer } from "../../../../sqs/command/authorize/sim-sqs-service-send-authorizer.js";
import type { SimS3NotificationDestinationRequest } from "../sim-s3-notification-destination.js";
import { simS3ServicePrincipal } from "../sim-s3-service-principal.js";
import type { SimS3NotificationQueueArn } from "./sim-s3-notification-queue-arn.js";
import { simScopeIamAuthZ } from "../../../../iam/authorize/sim-iam-region-auth-z.js";

interface SimS3NotificationQueueProperties {
  readonly arn: SimS3NotificationQueueArn;
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * One queue an S3 Bucket is notifying, in the Account and Region its ARN names.
 *
 * Everything here is asked of the queue's own Account, which is what makes a
 * queue in another Account reachable: its policy is the grant, and its
 * Account's IAM is what evaluates it.
 */
export class SimS3NotificationQueue {
  private readonly arn: SimS3NotificationQueueArn;
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimS3NotificationQueueProperties) {
    this.arn = properties.arn;
    this.scope = properties.scope;
  }

  /**
   * Why S3 may not send to this queue, or nothing when it may.
   */
  sendRefusal(
    request: SimS3NotificationDestinationRequest,
  ): string | undefined {
    const queue = this.scope.sqs().findQueue(this.arn.queueName);

    if (queue === undefined) {
      return `${request.destinationArn} is not a simulated SQS queue.`;
    }

    const decision = new SimSqsServiceSendAuthorizer({
      iam: simScopeIamAuthZ(this.scope),
    }).authorize({
      queue,
      servicePrincipal: simS3ServicePrincipal,
      sourceArn: request.bucketArn,
      sourceAccount: request.bucketOwnerAccountId,
    });

    if (decision.isDenied) {
      return (
        `The queue policy of ${request.destinationArn} does not allow ` +
        `${simS3ServicePrincipal} to send to it for ${request.bucketArn}. ` +
        "Grant sqs:SendMessage with the queue's Policy attribute."
      );
    }

    return undefined;
  }

  /**
   * Send one message body to this queue as the S3 service principal.
   *
   * This goes through the ordinary SendMessage path rather than putting a
   * message on the queue directly, so a delivered event is the same thing an
   * SDK caller would have sent, and is authorized again on the way in.
   */
  async send(
    request: SimS3NotificationDestinationRequest,
    body: string,
  ): Promise<void> {
    await this.scope.sqs().sendMessage(
      { input: { QueueUrl: this.arn.queueUrl, MessageBody: body } },
      {
        caller: { kind: "service", service: simS3ServicePrincipal },
        sourceArn: request.bucketArn,
        sourceAccount: request.bucketOwnerAccountId,
      },
    );
  }
}

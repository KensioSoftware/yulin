import type { SimAwsAccountRegionContainer } from "../../../../aws/sim-aws-account-region-scope.js";
import { SimSnsServicePublishAuthorizer } from "../../../../sns/command/authorize/sim-sns-service-publish-authorizer.js";
import type { SimS3NotificationDestinationRequest } from "../sim-s3-notification-destination.js";
import { simS3ServicePrincipal } from "../sim-s3-service-principal.js";
import type { SimS3NotificationTopicArn } from "./sim-s3-notification-topic-arn.js";
import { simScopeIamAuthZ } from "../../../../iam/authorize/sim-iam-region-auth-z.js";

/**
 * The subject real S3 publishes every event notification with.
 *
 * It is the same string for every Bucket and every event, so a subscriber
 * cannot tell one notification from another by it. It is carried because the
 * SNS envelope a queue receives has a `Subject` field in it, and leaving it out
 * would make a simulated envelope differ from a real one for no reason.
 */
export const simS3NotificationSubject = "Amazon S3 Notification";

interface SimS3NotificationTopicProperties {
  readonly arn: SimS3NotificationTopicArn;
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * One topic an S3 Bucket is notifying, in the Account and Region its ARN names.
 *
 * Everything here is asked of the topic's own Account, which is what makes a
 * topic in another Account reachable: its policy is the grant, and its
 * Account's IAM is what evaluates it.
 */
export class SimS3NotificationTopic {
  private readonly arn: SimS3NotificationTopicArn;
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimS3NotificationTopicProperties) {
    this.arn = properties.arn;
    this.scope = properties.scope;
  }

  /**
   * Why S3 may not publish to this topic, or nothing when it may.
   */
  publishRefusal(
    request: SimS3NotificationDestinationRequest,
  ): string | undefined {
    const topic = this.scope.sns().findTopic(this.arn.topicName);

    if (topic === undefined) {
      return `${request.destinationArn} is not a simulated SNS topic.`;
    }

    const decision = new SimSnsServicePublishAuthorizer({
      iam: simScopeIamAuthZ(this.scope),
    }).authorize({
      topic,
      servicePrincipal: simS3ServicePrincipal,
      sourceArn: request.bucketArn,
      sourceAccount: request.bucketOwnerAccountId,
    });

    if (decision.isDenied) {
      return (
        `The topic policy of ${request.destinationArn} does not allow ` +
        `${simS3ServicePrincipal} to publish to it for ${request.bucketArn}. ` +
        "Grant sns:Publish with the topic's Policy attribute."
      );
    }

    return undefined;
  }

  /**
   * Publish one message body to this topic as the S3 service principal.
   *
   * This goes through the ordinary Publish path rather than handing the message
   * to the topic's subscriptions directly, so a delivered event is the same
   * thing an SDK caller would have published, and is authorized again on the
   * way in.
   */
  async publish(
    request: SimS3NotificationDestinationRequest,
    body: string,
  ): Promise<void> {
    await this.scope.sns().publish(
      {
        input: {
          TopicArn: this.arn.value,
          Subject: simS3NotificationSubject,
          Message: body,
        },
      },
      {
        caller: { kind: "service", service: simS3ServicePrincipal },
        sourceArn: request.bucketArn,
        sourceAccount: request.bucketOwnerAccountId,
      },
    );
  }
}

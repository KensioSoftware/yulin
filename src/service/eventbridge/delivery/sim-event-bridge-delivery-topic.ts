import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { SimSnsServicePublishAuthorizer } from "../../sns/command/authorize/sim-sns-service-publish-authorizer.js";
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
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";

interface SimEventBridgeDeliveryTopicProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * A topic a simulated rule is sending an event to, in the Account and Region
 * the target ARN names.
 *
 * The published message is the event as JSON, which the topic then fans out to
 * its own subscriptions. So a rule targeting a topic reaches everything
 * subscribed to that topic, and each subscriber sees the event inside SNS's
 * own envelope rather than on its own.
 */
export class SimEventBridgeDeliveryTopic {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimEventBridgeDeliveryTopicProperties) {
    this.scope = properties.scope;
  }

  /**
   * Publish the event to the topic, if it admits EventBridge for this rule.
   */
  async deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    const source = simEventBridgeDeliverySource(request);
    const targetArn = request.target.arn;
    const topic = this.scope.sns().findTopic(targetArn.resource);

    if (topic === undefined) {
      throw new SimEventBridgeTargetNotFound(
        `${targetArn.value} is not a simulated SNS topic.`,
      );
    }

    const decision = new SimSnsServicePublishAuthorizer({
      iam: simScopeIamAuthZ(this.scope),
    }).authorize({
      topic,
      servicePrincipal: simEventBridgeServicePrincipal,
      ...source,
    });

    if (decision.isDenied) {
      throw new SimEventBridgeDeliveryNotPermitted(
        `The topic policy of ${targetArn.value} does not allow ` +
          `${simEventBridgeServicePrincipal} to publish to it for ` +
          `${source.sourceArn}. Grant sns:Publish with the topic's Policy ` +
          `attribute.`,
      );
    }

    // Published through the ordinary Publish path, so a delivered event fans
    // out to the topic's subscriptions exactly as an SDK caller's message
    // would.
    await this.scope.sns().publish(
      {
        input: {
          TopicArn: topic.arn.value,
          Message: simEventBridgeDeliveryJson(request),
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

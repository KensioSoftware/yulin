import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import { simSnsConditionContext } from "./sim-sns-condition-context.js";
import { simSnsTopicResourcePolicies } from "./sim-sns-topic-resource-policies.js";

interface SimSnsServicePublishAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimSnsServicePublishAuthorizationInput {
  readonly topic: SimSnsTopic;

  /** The service principal the publishing service calls SNS as. */
  readonly servicePrincipal: string;

  /**
   * What the service is publishing for, such as the S3 Bucket an event came
   * from.
   */
  readonly sourceArn?: string | undefined;

  /** The Account the publishing service's own resource belongs to. */
  readonly sourceAccount?: string | undefined;
}

/**
 * Decides whether a simulated AWS service may publish a message to a topic.
 *
 * A service principal owns no identity policies anywhere, so the topic's own
 * policy is the whole decision. The answer is a decision rather than a thrown
 * error because a service asks this before it has a message to publish: S3
 * validates the destination when a notification configuration is applied, and
 * has to report the refusal as part of refusing the configuration.
 *
 * A service with a message in hand publishes it through `Publish` as usual,
 * which authorizes the same way. Nothing is remembered from the earlier
 * question, so a topic policy changed in between stops the delivery.
 */
export class SimSnsServicePublishAuthorizer {
  private static readonly action = "sns:Publish";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimSnsServicePublishAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Evaluate `sns:Publish` for a service against the topic.
   */
  authorize(
    input: SimSnsServicePublishAuthorizationInput,
  ): SimIamAuthorizationDecision {
    return this.iam.authorize({
      action: SimSnsServicePublishAuthorizer.action,
      resource: input.topic.arn.value,
      caller: { kind: "service", service: input.servicePrincipal },
      resourcePolicies: simSnsTopicResourcePolicies(input.topic),
      conditionContext: simSnsConditionContext({
        ...(input.sourceArn !== undefined && { sourceArn: input.sourceArn }),
        ...(input.sourceAccount !== undefined && {
          sourceAccount: input.sourceAccount,
        }),
      }),
    });
  }
}

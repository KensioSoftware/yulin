import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSns } from "../sim-sns.js";
import type { SimSnsSubscription } from "../subscription/sim-sns-subscription.js";
import type { SimSnsTopic } from "../topic/sim-sns-topic.js";
import type { SimCfnSnsTopicPolicyCreator } from "./topic-policy/sim-cfn-sns-topic-policy-creator.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnSnsResourceDeleterProperties {
  readonly sns: SimSns;
  readonly topicPolicyCreator: SimCfnSnsTopicPolicyCreator;
}

/**
 * Deletes the simulated SNS resources a CloudFormation Stack created.
 *
 * There is no DeleteTopicPolicy in SNS. A topic policy is the `Policy`
 * attribute of the topics it names, so removing one is SetTopicAttributes
 * setting that attribute to an empty string, which is how the SDK clears it
 * too.
 *
 * A subscription needs no deleter of its own when its topic goes with it, since
 * DeleteTopic removes a topic's subscriptions as real SNS does. It has one
 * because a stack can drop a subscription and keep the topic, and because the
 * teardown reaches the subscription first either way.
 */
export class SimCfnSnsResourceDeleter {
  private readonly sns: SimSns;
  private readonly topicPolicyCreator: SimCfnSnsTopicPolicyCreator;

  constructor(properties: SimCfnSnsResourceDeleterProperties) {
    this.sns = properties.sns;
    this.topicPolicyCreator = properties.topicPolicyCreator;
  }

  /**
   * Delete a simulated SNS resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Topic": {
        await this.deleteTopic(resource, options);
        return;
      }
      case "Subscription": {
        await this.unsubscribe(resource, options);
        return;
      }
      case "TopicPolicy": {
        await this.topicPolicyCreator.delete(resource, properties, options);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim SNS CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private async deleteTopic(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const topic = resource.simResource as SimSnsTopic | undefined;
    assertDefined(
      topic,
      `sim SNS topic for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.sns.deleteTopic(
      { input: { TopicArn: topic.arn.value } },
      options,
    );
  }

  private async unsubscribe(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const subscription = resource.simResource as SimSnsSubscription | undefined;
    assertDefined(
      subscription,
      `sim SNS subscription for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.sns.unsubscribe(
      { input: { SubscriptionArn: subscription.arn.value } },
      options,
    );
  }
}

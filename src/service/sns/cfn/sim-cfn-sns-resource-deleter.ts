import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSns } from "../sim-sns.js";
import type { SimSnsSubscription } from "../subscription/sim-sns-subscription.js";
import type { SimSnsTopic } from "../topic/sim-sns-topic.js";
import { simSnsPolicyAttributeName } from "../topic/sim-sns-topic-attribute-names.js";
import { simCfnSnsPolicyTopicArns } from "./topic-policy/sim-cfn-sns-topic-policy-properties.js";

interface SimCfnSnsResourceDeleterProperties {
  readonly sns: SimSns;
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

  constructor(properties: SimCfnSnsResourceDeleterProperties) {
    this.sns = properties.sns;
  }

  /**
   * Delete a simulated SNS resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Topic": {
        await this.deleteTopic(resource);
        return;
      }
      case "Subscription": {
        await this.unsubscribe(resource);
        return;
      }
      case "TopicPolicy": {
        await this.clearTopicPolicy(resource, properties);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim SNS CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private async deleteTopic(resource: SimCfnResource): Promise<void> {
    const topic = resource.simResource as SimSnsTopic | undefined;
    assertDefined(
      topic,
      `sim SNS topic for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.sns.deleteTopic({ input: { TopicArn: topic.arn.value } });
  }

  private async unsubscribe(resource: SimCfnResource): Promise<void> {
    const subscription = resource.simResource as SimSnsSubscription | undefined;
    assertDefined(
      subscription,
      `sim SNS subscription for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.sns.unsubscribe({
      input: { SubscriptionArn: subscription.arn.value },
    });
  }

  /**
   * Take the policy back off every topic the Resource named.
   *
   * The Resource points at only the first of them, so the topics are read from
   * the template the same way creation read them.
   */
  private async clearTopicPolicy(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    const topicArns = simCfnSnsPolicyTopicArns(resource.logicalId, properties);

    await Promise.all(
      topicArns.map(async (topicArn) =>
        this.sns.setTopicAttributes({
          input: {
            TopicArn: topicArn,
            AttributeName: simSnsPolicyAttributeName,
            AttributeValue: "",
          },
        }),
      ),
    );
  }
}

import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimSns } from "../sim-sns.js";
import { SimCfnSnsResourceDeleter } from "./sim-cfn-sns-resource-deleter.js";
import { SimCfnSnsSubscriptionCreator } from "./subscription/sim-cfn-sns-subscription-creator.js";
import { SimCfnSnsTopicCreator } from "./topic/sim-cfn-sns-topic-creator.js";
import { SimCfnSnsTopicPolicyCreator } from "./topic-policy/sim-cfn-sns-topic-policy-creator.js";

interface SimSnsCfnResourceFactoryProperties {
  readonly sns: SimSns;
}

/**
 * CloudFormation Resource factory for simulated SNS resources.
 */
export class SimSnsCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly topicCreator: SimCfnSnsTopicCreator;
  private readonly subscriptionCreator: SimCfnSnsSubscriptionCreator;
  private readonly topicPolicyCreator: SimCfnSnsTopicPolicyCreator;
  private readonly deleter: SimCfnSnsResourceDeleter;

  constructor(properties: SimSnsCfnResourceFactoryProperties) {
    this.topicCreator = new SimCfnSnsTopicCreator({ sns: properties.sns });
    this.subscriptionCreator = new SimCfnSnsSubscriptionCreator({
      sns: properties.sns,
    });
    this.topicPolicyCreator = new SimCfnSnsTopicPolicyCreator({
      sns: properties.sns,
    });
    this.deleter = new SimCfnSnsResourceDeleter({ sns: properties.sns });
  }

  /**
   * Create a simulated SNS resource from a CloudFormation Resource.
   *
   * The topic, its subscriptions and its policy are the AWS::SNS::* Resource
   * types this simulation models. Anything else is reported as unsupported and
   * skipped rather than quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case "Topic": {
        return await this.topicCreator.create(resource, properties);
      }
      case "Subscription": {
        return await this.subscriptionCreator.create(resource, properties);
      }
      case "TopicPolicy": {
        return await this.topicPolicyCreator.create(resource, properties);
      }
      default: {
        throw new Error(
          `Unsupported sim SNS CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated SNS resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(
      resourceTypeName,
      resource,
      context.resolvedProperties ?? resource.properties,
    );
  }
}

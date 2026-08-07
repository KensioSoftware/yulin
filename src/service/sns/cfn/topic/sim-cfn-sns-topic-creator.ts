import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSns } from "../../sim-sns.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import { simCfnSnsResourceCreation } from "../sim-cfn-sns-resource-error.js";
import { snsTopicResourceType } from "../sim-cfn-sns-resource-types.js";
import type { SimCfnSnsInlineSubscription } from "./sim-cfn-sns-inline-subscriptions.js";
import { SimCfnSnsTopicProperties } from "./sim-cfn-sns-topic-properties.js";

interface SimCfnSnsTopicCreatorProperties {
  readonly sns: SimSns;
}

/**
 * Creates simulated topics from AWS::SNS::Topic Resources.
 *
 * The topic is created through the ordinary CreateTopic command rather than
 * constructed directly, so a topic a template deployed is the same thing an SDK
 * caller would have got: the same name validation, the same attributes, the
 * same refusals for what this simulation does not model.
 */
export class SimCfnSnsTopicCreator {
  private readonly sns: SimSns;

  constructor(properties: SimCfnSnsTopicCreatorProperties) {
    this.sns = properties.sns;
  }

  /**
   * Create a topic from an AWS::SNS::Topic Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimSnsTopic> {
    const topicProperties = new SimCfnSnsTopicProperties({
      resource,
      properties,
    });
    const name = topicProperties.name();
    const attributes = topicProperties.attributes();
    const inline = topicProperties.inlineSubscriptions();

    return simCfnSnsResourceCreation(
      snsTopicResourceType,
      resource.logicalId,
      async () => {
        await this.sns.createTopic({
          input: { Name: name, Attributes: attributes },
        });

        const topic = this.sns.findTopic(name);
        assertDefined(
          topic,
          `sim SNS topic ${name} after CloudFormation creation`,
        );

        await this.subscribeInline(topic, inline);

        return topic;
      },
    );
  }

  /**
   * Subscribe everything the topic's own `Subscription` list declares.
   *
   * They go through Subscribe one after another rather than together, so a
   * later entry naming an endpoint its protocol cannot reach fails the Resource
   * with the earlier ones already subscribed, which is what a template asking
   * for two subscriptions and getting one has to look like.
   */
  private async subscribeInline(
    topic: SimSnsTopic,
    subscriptions: readonly SimCfnSnsInlineSubscription[],
  ): Promise<void> {
    for (const subscription of subscriptions) {
      // eslint-disable-next-line no-await-in-loop -- one entry at a time, so a refused entry leaves the earlier ones subscribed
      await this.sns.subscribe({
        input: {
          TopicArn: topic.arn.value,
          Protocol: subscription.protocol,
          Endpoint: subscription.endpoint,
        },
      });
    }
  }
}

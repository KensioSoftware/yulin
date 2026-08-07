import type { SimSnsTopic } from "../../../../sns/topic/sim-sns-topic.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimSnsTopicCfnProperties {
  readonly topic: SimSnsTopic;
}

/**
 * CloudFormation-facing values for a simulated SNS topic.
 */
export class SimSnsTopicCfn implements SimCfnResourceValueAdapter {
  private readonly topic: SimSnsTopic;

  constructor(properties: SimSnsTopicCfnProperties) {
    this.topic = properties.topic;
  }

  /**
   * AWS::SNS::Topic Ref returns the topic ARN.
   *
   * SNS has no identifier for a topic other than its ARN, so a Ref is directly
   * usable as the TopicArn of a Publish or a Subscribe.
   */
  refValue(): SimCfnTemplateValue {
    return this.topic.arn.value;
  }

  /**
   * AWS::SNS::Topic attributes.
   *
   * The ARN is the same string the Ref gives, and is what an IAM policy names
   * the topic by. The name is what a template reads when it wants the topic
   * without the Account and Region around it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "TopicArn": {
        return this.topic.arn.value;
      }
      case "TopicName": {
        return this.topic.name.value;
      }
      default: {
        throw new Error(
          `Unsupported AWS::SNS::Topic attribute ${attributeName}`,
        );
      }
    }
  }
}

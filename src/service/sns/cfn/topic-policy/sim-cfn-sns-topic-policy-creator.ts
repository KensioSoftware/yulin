import { assertDefined } from "../../../../util/type-guard/defined.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSns } from "../../sim-sns.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import { simSnsPolicyAttributeName } from "../../topic/sim-sns-topic-attribute-names.js";
import { parseSnsTopicArn } from "../../topic/sim-sns-topic-arn.js";
import { simCfnSnsResourceCreation } from "../sim-cfn-sns-resource-error.js";
import { snsTopicPolicyResourceType } from "../sim-cfn-sns-resource-types.js";
import { simCfnSnsPolicyTopicArns } from "./sim-cfn-sns-topic-policy-properties.js";

interface SimCfnSnsTopicPolicyCreatorProperties {
  readonly sns: SimSns;
}

/**
 * Creates simulated topic policies from AWS::SNS::TopicPolicy Resources.
 *
 * This is what CDK emits for `grantPublish` to a service principal and for
 * every `addToResourcePolicy`, so a synthesized template reaches it whether or
 * not the app mentions a topic policy itself. The policy is set through the
 * ordinary SetTopicAttributes command, so one declared in a template is
 * validated and enforced exactly as one set through the SDK.
 */
export class SimCfnSnsTopicPolicyCreator {
  private readonly sns: SimSns;

  constructor(properties: SimCfnSnsTopicPolicyCreatorProperties) {
    this.sns = properties.sns;
  }

  /**
   * Attach a policy to each topic the Resource names.
   *
   * The first topic is returned as the Resource's simulated object, because a
   * topic policy has no existence of its own in SNS: it is the `Policy`
   * attribute of the topics it names.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimSnsTopic> {
    const topicArns = simCfnSnsPolicyTopicArns(resource.logicalId, properties);
    const policy = jsonStringify(
      this.policyDocumentForResource(resource, properties),
    );

    return simCfnSnsResourceCreation(
      snsTopicPolicyResourceType,
      resource.logicalId,
      async () => {
        const topics = await Promise.all(
          topicArns.map(async (topicArn) =>
            this.policyApplied(topicArn, policy),
          ),
        );

        const first = topics[0];
        assertDefined(
          first,
          `sim SNS topic after CloudFormation topic policy creation for ${resource.logicalId}`,
        );

        return first;
      },
    );
  }

  /**
   * Set the policy on one topic and hand back the topic it was set on.
   */
  private async policyApplied(
    topicArn: string,
    policy: string,
  ): Promise<SimSnsTopic> {
    await this.sns.setTopicAttributes({
      input: {
        TopicArn: topicArn,
        AttributeName: simSnsPolicyAttributeName,
        AttributeValue: policy,
      },
    });

    const parts = parseSnsTopicArn(topicArn);
    assertDefined(parts, `topic ARN ${topicArn} SetTopicAttributes accepted`);

    const topic = this.sns.findTopic(parts.name);
    assertDefined(topic, `sim SNS topic at ${topicArn}`);

    return topic;
  }

  private policyDocumentForResource(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): object {
    const policyDocument = properties["PolicyDocument"];

    if (
      policyDocument === undefined ||
      policyDocument === null ||
      typeof policyDocument !== "object" ||
      Array.isArray(policyDocument)
    ) {
      throw new TypeError(
        `${snsTopicPolicyResourceType} ${resource.logicalId} requires a PolicyDocument object`,
      );
    }

    return policyDocument;
  }
}

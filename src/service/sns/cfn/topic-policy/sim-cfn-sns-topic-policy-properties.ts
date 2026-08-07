import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { snsTopicPolicyResourceType } from "../sim-cfn-sns-resource-types.js";

/**
 * The topic ARNs an AWS::SNS::TopicPolicy Resource names.
 *
 * `Ref` on an AWS::SNS::Topic gives its ARN, so a template naming its topics
 * the way CDK does arrives here as the ARNs SetTopicAttributes takes.
 *
 * Creation and deletion both read them, because the Resource points at only the
 * first of the topics it named and taking the policy back off needs all of
 * them.
 */
export function simCfnSnsPolicyTopicArns(
  logicalId: string,
  properties: SimCfnTemplateValueRecord,
): readonly string[] {
  const topics = properties["Topics"];

  if (!Array.isArray(topics) || topics.length === 0) {
    throw new TypeError(
      `${snsTopicPolicyResourceType} ${logicalId} requires a Topics list of topic ARNs`,
    );
  }

  return topics.map((topic) => {
    if (typeof topic !== "string") {
      throw new TypeError(
        `${snsTopicPolicyResourceType} ${logicalId} requires each entry of Topics to be a topic ARN string, got ${typeof topic}`,
      );
    }

    return topic;
  });
}

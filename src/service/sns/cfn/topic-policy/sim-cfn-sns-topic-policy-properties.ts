import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnSnsResourceError } from "../sim-cfn-sns-resource-error.js";
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
    throw topicPolicyError(
      logicalId,
      "Topics is required and must be a list of topic ARNs",
    );
  }

  return topics.map((topic) => {
    if (typeof topic !== "string") {
      throw topicPolicyError(
        logicalId,
        `each entry of Topics must be a topic ARN string, and one is a ${typeof topic}`,
      );
    }

    return topic;
  });
}

/**
 * The policy document an AWS::SNS::TopicPolicy Resource carries.
 *
 * A template writes it as an object where SetTopicAttributes takes a JSON
 * string, so what comes back here is what is serialised on the way in.
 */
export function simCfnSnsPolicyDocument(
  logicalId: string,
  properties: SimCfnTemplateValueRecord,
): object {
  const policyDocument = properties["PolicyDocument"];

  if (
    policyDocument === undefined ||
    policyDocument === null ||
    typeof policyDocument !== "object" ||
    Array.isArray(policyDocument)
  ) {
    throw topicPolicyError(
      logicalId,
      "PolicyDocument is required and must be an object",
    );
  }

  return policyDocument;
}

function topicPolicyError(logicalId: string, reason: string): Error {
  return simCfnSnsResourceError(snsTopicPolicyResourceType, logicalId, reason);
}

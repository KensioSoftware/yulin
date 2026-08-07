import type { SimIamResourcePolicyInput } from "../../../iam/authorize/context/sim-iam-auth-z-context-builder.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";

/**
 * The resource policies sim IAM should evaluate for a request against a topic.
 *
 * A topic that is not there contributes nothing, which is what keeps a caller
 * with no permission refused for a topic that does not exist: an absent topic
 * cannot admit anyone. A topic with no policy contributes nothing either, and
 * the decision is left to the caller's identity policies.
 */
export function simSnsTopicResourcePolicies(
  topic: SimSnsTopic | undefined,
): readonly SimIamResourcePolicyInput[] {
  if (topic === undefined) {
    return [];
  }

  const policy = topic.attributes.policy;

  if (policy === undefined) {
    return [];
  }

  return [
    {
      document: policy.document,
      policyName: "TopicPolicy",
      resourceArn: topic.arn.value,
    },
  ];
}

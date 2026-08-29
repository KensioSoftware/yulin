import type { SimIamResourcePolicyInput } from "../../../iam/authorize/context/sim-iam-authorization-input.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";

/**
 * The resource policies sim IAM should evaluate for a request against a queue.
 *
 * A queue that is not there contributes nothing, which is what keeps a caller
 * with no permission refused for a queue that does not exist: an absent queue
 * cannot admit anyone. A queue with no policy contributes nothing either, and
 * the decision is left to the caller's identity policies.
 */
export function simSqsQueueResourcePolicies(
  queue: SimSqsQueue | undefined,
): readonly SimIamResourcePolicyInput[] {
  if (queue === undefined) {
    return [];
  }

  const policy = queue.attributes.queuePolicy;

  if (policy === undefined) {
    return [];
  }

  return [
    {
      document: policy.document,
      policyName: "QueuePolicy",
      resourceArn: queue.arn.value,
    },
  ];
}

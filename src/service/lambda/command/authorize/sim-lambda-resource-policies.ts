import type { SimIamResourcePolicyInput } from "../../../iam/authorize/context/sim-iam-auth-z-input.js";
import type { SimLambdaPolicyResource } from "../../function/policy/sim-lambda-policy-resource.js";

/**
 * The name real Lambda reports a function's resource policy under.
 */
const policyName = "FunctionPolicy";

/**
 * The resource policies IAM should evaluate alongside identity policies for an
 * action on a function, one of its versions or one of its aliases.
 *
 * The resource is whichever of the three the request named, so a grant made on
 * an alias decides a call on that alias and nothing else. A resource with no
 * permissions granted contributes nothing, which leaves authorization exactly
 * as it was before resource policies existed. A resource that does not exist
 * contributes nothing either: the caller is refused or the resource is
 * reported missing, and neither needs a policy.
 */
export function simLambdaResourcePolicies(
  resource: SimLambdaPolicyResource | undefined,
): readonly SimIamResourcePolicyInput[] {
  if (resource === undefined || resource.resourcePolicy.isEmpty()) {
    return [];
  }

  return [
    {
      document: resource.resourcePolicy.document(),
      policyName,
      resourceArn: resource.arn,
    },
  ];
}

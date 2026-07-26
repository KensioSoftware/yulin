import type { SimIamResourcePolicyInput } from "../../../iam/authorize/context/sim-iam-auth-z-context-builder.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";

/**
 * The name real Lambda reports a function's resource policy under.
 */
const policyName = "FunctionPolicy";

/**
 * The resource policies IAM should evaluate alongside identity policies for an
 * action on a function.
 *
 * A function with no permissions granted contributes nothing, which leaves
 * authorization exactly as it was before resource policies existed. A function
 * that does not exist contributes nothing either: the caller is refused or the
 * function is reported missing, and neither needs a policy.
 */
export function simLambdaResourcePolicies(
  simFunction: SimLambdaFunction | undefined,
): readonly SimIamResourcePolicyInput[] {
  if (simFunction === undefined || simFunction.resourcePolicy.isEmpty()) {
    return [];
  }

  return [
    {
      document: simFunction.resourcePolicy.document(),
      policyName,
      resourceArn: simFunction.arn,
    },
  ];
}

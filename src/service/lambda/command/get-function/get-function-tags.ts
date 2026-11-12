import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";

/**
 * The tags GetFunction reports alongside the configuration.
 *
 * Real Lambda leaves Tags out for a function that has none, and asks for
 * lambda:ListTags before it reports any. A caller allowed GetFunction alone is
 * answered without them.
 */
export function simLambdaGetFunctionTags(
  iam: SimIamInterServiceAuthZ,
  simFunction: SimLambdaFunction,
  caller: SimAwsCaller | undefined,
): { Tags?: Record<string, string> } {
  if (simFunction.tags.isEmpty) {
    return {};
  }

  const decision = iam.authorize({
    action: "lambda:ListTags",
    resource: simFunction.arn,
    caller,
  });

  return decision.isDenied ? {} : { Tags: simFunction.tags.record() };
}

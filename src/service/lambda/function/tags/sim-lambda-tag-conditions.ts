import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../../iam/tag/sim-iam-resource-tag-auth-z.js";
import { simLambdaFunctionNameOf } from "../sim-lambda-function-name.js";
import type { SimLambdaFunctionLookup } from "../url/sim-lambda-function-lookup.js";

/**
 * IAM authorization that gives a policy the tags of the function a request
 * acts on, as `aws:ResourceTag/<key>`.
 *
 * Every simulated Lambda command authorizes against a function ARN, so the
 * tags are read here once, from the function the ARN names, and the commands
 * say nothing about them. A version or alias ARN reads the function's tags,
 * since a function's tags are shared with all of them. A resource that is not
 * one of this scope's functions, such as `*` or a queue ARN, carries none.
 */
export function simLambdaTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  functions: SimLambdaFunctionLookup,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) => {
    const name = simLambdaFunctionNameOf(resource);
    const arn = functions.functionArn(name);
    const named = resource === arn || resource.startsWith(`${arn}:`);

    return named ? functions.find(name)?.tags.record() : undefined;
  });
}

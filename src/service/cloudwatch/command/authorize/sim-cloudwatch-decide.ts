import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simCloudWatchNamespaceConditionKey } from "../sim-cloudwatch-request-options.js";

/**
 * One authorization question: what is being done, to what, by whom, and in
 * which namespace where that narrows it.
 */
export interface SimCloudWatchAuthorization {
  readonly action: string;
  readonly resource: string;
  readonly caller: SimAwsCaller | undefined;
  readonly namespace?: string | undefined;
}

/**
 * Put one CloudWatch request to simulated IAM, refusing it if the answer is no.
 *
 * The namespace, where there is one, goes in as `cloudwatch:namespace`, which
 * is the condition key AWS's own documented publishing policies are written
 * with and the only way a policy can narrow an action with no resource to
 * name.
 */
export function decideSimCloudWatchRequest(
  iam: SimIamInterServiceAuthZ,
  request: SimCloudWatchAuthorization,
): SimAwsResolvedCaller {
  const { action, resource, namespace } = request;
  const decision = iam.authorize({
    action,
    resource,
    caller: request.caller,
    conditionContext:
      namespace === undefined
        ? undefined
        : { [simCloudWatchNamespaceConditionKey]: namespace },
  });

  if (decision.isDenied) {
    throw new SimIamAccessDenied({
      principal: decision.caller.principal,
      action,
      resource,
    });
  }

  return decision.caller;
}

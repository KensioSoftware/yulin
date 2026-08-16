import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simCloudWatchNamespaceConditionKey } from "../sim-cloudwatch-request-options.js";

/**
 * The resource every CloudWatch metric action authorizes against.
 *
 * Metrics have no ARN on real AWS. There is nothing for a policy to name, so
 * every one of these actions is granted on `*` and narrowed, if at all, by
 * condition rather than by resource.
 */
const metricResource = "*";

interface SimCloudWatchAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to CloudWatch metric requests.
 *
 * A policy written against a metric ARN is a policy that reaches nothing, here
 * and in an account: teams reaching for one find out at this boundary rather
 * than after a deployment.
 */
export class SimCloudWatchAuthorizer {
  readonly #iam: SimIamInterServiceAuthZ;

  constructor(properties: SimCloudWatchAuthorizerProperties) {
    this.#iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on this scope's metrics.
   */
  authorize(action: string, caller?: SimAwsCaller): SimAwsResolvedCaller {
    return this.decide(action, caller, undefined);
  }

  /**
   * Ensure the caller may write into a namespace.
   *
   * The namespace is supplied to IAM as `cloudwatch:namespace`, which is the
   * condition key AWS's own documented publishing policies are written with.
   */
  authorizeNamespace(
    action: string,
    namespace: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.decide(action, caller, namespace);
  }

  private decide(
    action: string,
    caller: SimAwsCaller | undefined,
    namespace: string | undefined,
  ): SimAwsResolvedCaller {
    const decision = this.#iam.authorize({
      action,
      resource: metricResource,
      caller,
      conditionContext:
        namespace === undefined
          ? undefined
          : { [simCloudWatchNamespaceConditionKey]: namespace },
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource: metricResource,
      });
    }

    return decision.caller;
  }
}

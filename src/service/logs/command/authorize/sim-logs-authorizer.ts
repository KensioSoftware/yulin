import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  simLogsAnyLogGroupArn,
  simLogsLogGroupWildcardArn,
} from "../../group/sim-logs-arn.js";

interface SimLogsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to CloudWatch Logs requests.
 *
 * An operation on one log group authorizes against that group's ARN with the
 * trailing `:*`, which is the form CloudWatch Logs policies are written in:
 * granting a function permission to write its own logs grants it on the
 * streams inside the group, and the wildcard is what covers them. A policy
 * naming `log-group:/aws/lambda/orders` without it therefore reaches nothing
 * here, exactly as it reaches nothing on real AWS.
 */
export class SimLogsAuthorizer {
  readonly #iam: SimIamInterServiceAuthZ;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimLogsAuthorizerProperties) {
    this.#iam = properties.iam;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a log group.
   *
   * The group need not exist. Real IAM evaluates a request before the service
   * handles it, so a caller with no permission is refused whether or not the
   * group is there, and CreateLogGroup authorizes against the ARN the group is
   * about to have.
   */
  authorizeLogGroup(
    action: string,
    logGroupName: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(
      action,
      simLogsLogGroupWildcardArn(this.#accountRegionScope, logGroupName),
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action that names no particular log
   * group, such as describing them all.
   *
   * The resource is every log group in this account and region, which is what
   * such a request actually reaches. A policy scoped to one group does not
   * cover it, and one written against `*` or the log group wildcard does.
   */
  authorizeAnyLogGroup(
    action: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(
      action,
      simLogsAnyLogGroupArn(this.#accountRegionScope),
      caller,
    );
  }

  private authorizeResource(
    action: string,
    resource: string,
    caller: SimAwsCaller | undefined,
  ): SimAwsResolvedCaller {
    const decision = this.#iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource,
      });
    }

    return decision.caller;
  }
}

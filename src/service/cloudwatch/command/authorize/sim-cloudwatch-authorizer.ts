import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { simCloudWatchAlarmArn } from "../../alarm/sim-cloudwatch-alarm-arn.js";
import { decideSimCloudWatchRequest } from "./sim-cloudwatch-decide.js";

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
  readonly accountRegionScope: SimAwsAccountRegionScope;
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
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimCloudWatchAuthorizerProperties) {
    this.#iam = properties.iam;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on this scope's metrics.
   */
  authorize(action: string, caller?: SimAwsCaller): SimAwsResolvedCaller {
    return decideSimCloudWatchRequest(this.#iam, {
      action,
      resource: metricResource,
      caller,
    });
  }

  /**
   * Ensure the caller may perform an action on one alarm.
   *
   * Alarms are the one thing in CloudWatch a policy can name, so these
   * authorize against the alarm's ARN rather than against `*`. The alarm need
   * not exist: real IAM evaluates a request before the service handles it, so
   * PutMetricAlarm authorizes against the ARN the alarm is about to have.
   */
  authorizeAlarm(
    action: string,
    alarmName: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return decideSimCloudWatchRequest(this.#iam, {
      action,
      resource: simCloudWatchAlarmArn(this.#accountRegionScope, alarmName),
      caller,
    });
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
    return decideSimCloudWatchRequest(this.#iam, {
      action,
      resource: metricResource,
      caller,
      namespace,
    });
  }
}

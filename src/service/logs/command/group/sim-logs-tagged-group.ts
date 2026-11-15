import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceNotFoundException,
} from "../../error/sim-logs.error.js";
import { simLogsParsedLogGroupArn } from "../../group/sim-logs-arn.js";
import type { SimLogsLogGroup } from "../../group/sim-logs-log-group.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";

/**
 * Where a tag command finds its log group and authorizes against it.
 */
export interface SimLogsTagScope {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The log group an ARN names, once the caller is allowed the action on it.
 * The caller is authorized before the group is looked up. An ARN naming
 * anything but a log group is refused.
 */
export function simLogsTaggedGroup(
  scope: SimLogsTagScope,
  action: string,
  resourceArn: string | undefined,
  options: SimLogsRequestOptions | undefined,
  conditions: SimIamConditions,
): SimLogsLogGroup {
  const parsed = simLogsParsedLogGroupArn(resourceArn ?? "");

  if (parsed === undefined) {
    throw new SimLogsInvalidParameterException(
      `${JSON.stringify(resourceArn ?? "")} is not a log group ARN. Log ` +
        "groups are the only CloudWatch Logs resources whose tags are " +
        "simulated.",
    );
  }

  scope.authorizer.authorizeLogGroup(
    action,
    parsed.logGroupName,
    options?.caller,
    conditions,
  );

  const { accountId, regionName } = scope.accountRegionScope;
  const group =
    parsed.accountId === accountId && parsed.regionName === regionName
      ? scope.groups.find(parsed.logGroupName)
      : undefined;

  if (group === undefined) {
    throw new SimLogsResourceNotFoundException(
      "The specified log group does not exist.",
    );
  }

  return group;
}

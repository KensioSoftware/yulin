import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import { simLogsArnPrefix } from "./sim-logs-arn.js";
import type { SimLogsLogGroupStore } from "./sim-logs-log-group-store.js";

/**
 * IAM authorization that gives a policy the tags of the log group a request
 * acts on, as `aws:ResourceTag/<key>`.
 *
 * A request on a log stream acts on the group holding it, so the group's tags
 * reach a request naming the stream as well. A group the request is about to
 * create carries none.
 */
export function simLogsTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  scope: SimAwsAccountRegionScope,
  groups: SimLogsLogGroupStore,
): SimIamInterServiceAuthZ {
  const prefix = `${simLogsArnPrefix(scope)}log-group:`;

  return new SimIamResourceTagAuthZ(iam, (resource) => {
    // A log group name cannot hold a colon, so the name ends at the first.
    const [name = ""] = resource.slice(prefix.length).split(":", 1);

    return resource.startsWith(prefix)
      ? groups.find(name)?.tags.record()
      : undefined;
  });
}

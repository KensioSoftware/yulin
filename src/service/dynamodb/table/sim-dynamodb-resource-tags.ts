import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../../iam/authorize/sim-iam-region-auth-z.js";
import {
  SimIamResourceTagAuthZ,
  simIamNamesResource,
} from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimDynamoDbTableStore } from "./sim-dynamodb-table-store.js";

/**
 * IAM authorization for one Account and Region scope that gives a policy the
 * tags of the table a request acts on, as `aws:ResourceTag/<key>`.
 *
 * An index or a stream holds no tags of its own. A request naming one reads
 * the tags of its table, as DynamoDB does.
 */
export function simDynamoDbIam(
  iam: SimIamInterServiceAuthZ | undefined,
  scope: SimAwsAccountRegionScope,
  tables: SimDynamoDbTableStore,
): SimIamInterServiceAuthZ {
  const regional = simIamInRegion(iam, scope.regionName);

  return new SimIamResourceTagAuthZ(regional, (resource) => {
    const name = /:table\/([^\/]+)/v.exec(resource)?.[1];
    const table = name === undefined ? undefined : tables.findByName(name);

    return table !== undefined && simIamNamesResource(table.arn, resource, "/")
      ? table.tags.record()
      : undefined;
  });
}

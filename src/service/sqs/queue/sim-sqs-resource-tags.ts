import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../../iam/authorize/sim-iam-region-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimSqsQueueStore } from "./sim-sqs-queue-store.js";

/**
 * IAM authorization for one Account and Region scope that gives a policy the
 * tags of the queue a request acts on, as `aws:ResourceTag/<key>`.
 *
 * A queue the request is about to create carries none.
 */
export function simSqsIam(
  iam: SimIamInterServiceAuthZ | undefined,
  scope: SimAwsAccountRegionScope,
  queues: SimSqsQueueStore,
): SimIamInterServiceAuthZ {
  const regional = simIamInRegion(iam, scope.regionName);

  return new SimIamResourceTagAuthZ(regional, (resource) => {
    const name = /:([^:]+)$/v.exec(resource)?.[1];
    const queue = name === undefined ? undefined : queues.find(name);

    return queue?.arn.value === resource ? queue.tags.record() : undefined;
  });
}

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../../iam/authorize/sim-iam-region-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimSnsTopicStore } from "./sim-sns-topic-store.js";

/**
 * IAM authorization for one Account and Region scope that gives a policy the
 * tags of the topic a request acts on, as `aws:ResourceTag/<key>`.
 *
 * A topic the request is about to create carries none.
 */
export function simSnsIam(
  iam: SimIamInterServiceAuthZ | undefined,
  scope: SimAwsAccountRegionScope,
  topics: SimSnsTopicStore,
): SimIamInterServiceAuthZ {
  const regional = simIamInRegion(iam, scope.regionName);

  return new SimIamResourceTagAuthZ(regional, (resource) => {
    const name = /:([^:]+)$/v.exec(resource)?.[1];
    const topic = name === undefined ? undefined : topics.find(name);

    return topic?.arn.value === resource ? topic.tags.record() : undefined;
  });
}

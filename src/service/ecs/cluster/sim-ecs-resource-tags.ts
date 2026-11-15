import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimEcsClusterStore } from "./sim-ecs-cluster-store.js";

/**
 * IAM authorization that gives a policy the tags of the cluster a request acts
 * on, as both `aws:ResourceTag/<key>` and `ecs:ResourceTag/<key>`.
 *
 * A task or a service is a resource of its own to IAM, and carries no tags
 * here.
 */
export function simEcsTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  clusters: SimEcsClusterStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(
    iam,
    (resource) => {
      const name = /:cluster\/([^\/]+)$/v.exec(resource)?.[1];
      const cluster = name === undefined ? undefined : clusters.find(name);

      return cluster?.clusterArn === resource
        ? Object.fromEntries(
            cluster.tags.map((tag) => [tag.key ?? "", tag.value ?? ""]),
          )
        : undefined;
    },
    "ecs",
  );
}

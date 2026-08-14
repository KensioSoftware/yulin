import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { simEcsDefaultClusterName } from "./sim-ecs-cluster-arn.js";
import type { SimEcsClusterDetail } from "./sim-ecs-cluster.js";

/**
 * What a test asks for when it wants a cluster already created.
 */
export interface SimEcsCreatedClusterInput {
  readonly clusterName: string;
}

/**
 * Creates one ECS cluster.
 *
 * A task needs a cluster to run in, and a request naming none means the
 * `default` one, which real ECS does not create by itself. That is what a test
 * about running a task wants and none of them is about, so it defaults to the
 * default cluster.
 *
 * ```typescript
 * await simEcsClusterFactory.make({}, simAws);
 * ```
 */
export const simEcsClusterFactory = new AsyncMappedFactory<
  SimEcsCreatedClusterInput,
  SimEcsClusterDetail,
  SimAws
>(
  () => ({ clusterName: simEcsDefaultClusterName }),
  async (input, simAws) => {
    const creation = await simAws
      .ecs()
      .createCluster({ input: { clusterName: input.clusterName } });

    assertDefined(
      creation.cluster,
      "Creating a sim ECS cluster gave none back",
    );

    return creation.cluster;
  },
);

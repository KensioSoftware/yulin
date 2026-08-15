import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimEcsServiceDetail } from "./sim-ecs-service-detail.js";

/**
 * What a test asks for when it wants a service already created.
 */
export interface SimEcsCreatedServiceInput {
  readonly clusterName: string;
  readonly serviceName: string;
  readonly taskDefinition: string;
  readonly desiredCount: number;
}

/**
 * Creates one ECS service.
 *
 * The defaults line up with the cluster and task definition factories, so a
 * test wanting a service to update, describe or delete asks all three for
 * their defaults and gets a service running one task:
 *
 * ```typescript
 * await simEcsClusterFactory.make({}, simAws);
 * await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
 * const service = await simEcsServiceFactory.make({}, simAws);
 * ```
 */
export const simEcsServiceFactory = new AsyncMappedFactory<
  SimEcsCreatedServiceInput,
  SimEcsServiceDetail,
  SimAws
>(
  () => ({
    clusterName: "default",
    serviceName: "checkout",
    taskDefinition: "checkout",
    desiredCount: 1,
  }),
  async (input, simAws) => {
    const creation = await simAws.ecs().createService({
      input: {
        cluster: input.clusterName,
        serviceName: input.serviceName,
        taskDefinition: input.taskDefinition,
        desiredCount: input.desiredCount,
      },
    });

    assertDefined(
      creation.service,
      "Creating a sim ECS service gave none back",
    );

    return creation.service;
  },
);

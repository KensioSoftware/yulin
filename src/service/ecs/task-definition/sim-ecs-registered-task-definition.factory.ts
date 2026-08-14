import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimEcsTaskDefinitionDetail } from "./sim-ecs-task-definition-detail.js";

/**
 * What a test asks for when it wants a task definition already registered.
 */
export interface SimEcsRegisteredTaskDefinitionInput {
  readonly family: string;
  readonly containerName: string;
  readonly image: string;
}

/**
 * Registers one revision of a task definition family.
 *
 * A family and one container is the smallest registration ECS accepts, and it
 * is what a test wanting a revision to describe, deregister or list needs. A
 * test about what a registration declares builds its own request instead.
 *
 * ```typescript
 * const revision = await simEcsRegisteredTaskDefinitionFactory.make(
 *   { family: "checkout" },
 *   simAws,
 * );
 * ```
 */
export const simEcsRegisteredTaskDefinitionFactory = new AsyncMappedFactory<
  SimEcsRegisteredTaskDefinitionInput,
  SimEcsTaskDefinitionDetail,
  SimAws
>(
  () => ({
    family: "checkout",
    containerName: "app",
    image: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:latest",
  }),
  async (input, simAws) => {
    const registration = await simAws.ecs().registerTaskDefinition({
      input: {
        family: input.family,
        containerDefinitions: [
          { name: input.containerName, image: input.image },
        ],
      },
    });

    assertDefined(
      registration.taskDefinition,
      "Registering a sim ECS task definition gave none back",
    );

    return registration.taskDefinition;
  },
);

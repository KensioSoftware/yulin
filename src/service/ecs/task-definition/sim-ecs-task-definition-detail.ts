import type { SimArn } from "../../aws/arn.js";
import type { SimEcsContainerDefinitionType } from "./container/sim-ecs-container-definition.js";
import type { SimEcsTaskDefinitionSettingsType } from "./sim-ecs-task-definition-settings.js";

/**
 * The states a simulated ECS task definition revision can be in.
 */
export type SimEcsTaskDefinitionStatus = "ACTIVE" | "INACTIVE";

/**
 * Minimal structural sim ECS described task definition.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_TaskDefinition.html
 */
export interface SimEcsTaskDefinitionDetail extends SimEcsTaskDefinitionSettingsType {
  readonly taskDefinitionArn?: SimArn | undefined;
  readonly family?: string | undefined;
  readonly revision?: number | undefined;
  readonly status?: SimEcsTaskDefinitionStatus | undefined;
  readonly containerDefinitions?:
    | readonly SimEcsContainerDefinitionType[]
    | undefined;
  readonly registeredAt?: Date | undefined;
  readonly registeredBy?: string | undefined;
  readonly deregisteredAt?: Date | undefined;
}

/**
 * What a revision hands over to be described.
 */
export interface SimEcsTaskDefinitionDetailInput {
  readonly settings: SimEcsTaskDefinitionSettingsType;
  readonly taskDefinitionArn: SimArn;
  readonly family: string;
  readonly revision: number;
  readonly status: SimEcsTaskDefinitionStatus;
  readonly containerDefinitions: readonly SimEcsContainerDefinitionType[];
  readonly registeredAt: Date;
  readonly registeredBy: string | undefined;
  readonly deregisteredAt: Date | undefined;
}

/**
 * Build one revision as `DescribeTaskDefinition` reports it.
 *
 * The two instants are copied out rather than handed over, so a caller reading
 * a described revision cannot move the stored one by writing to the `Date` it
 * was given. What the registration never set is left out rather than reported
 * as undefined.
 */
export function simEcsTaskDefinitionDetail(
  input: SimEcsTaskDefinitionDetailInput,
): SimEcsTaskDefinitionDetail {
  return {
    ...input.settings,
    taskDefinitionArn: input.taskDefinitionArn,
    family: input.family,
    revision: input.revision,
    status: input.status,
    containerDefinitions: input.containerDefinitions,
    registeredAt: new Date(input.registeredAt),
    ...(input.registeredBy !== undefined && {
      registeredBy: input.registeredBy,
    }),
    ...(input.deregisteredAt !== undefined && {
      deregisteredAt: new Date(input.deregisteredAt),
    }),
  };
}

import type {
  SimEcsContainerBindingHandler,
  SimEcsContainerBindingTarget,
} from "../../bind/sim-ecs-container-binding.type.js";

/**
 * A binding targeting a container through the Resource that declares it.
 *
 * A template names its task definition by logical ID, and CDK generates that
 * logical ID from a construct path and a hash, so the construct ID is accepted
 * as well. The container name may be left out where the task definition
 * declares one container, since there is then nothing to choose between.
 */
export interface SimCfnEcsTaskDefinitionBindingTarget {
  readonly logicalId: string;
  readonly containerName?: string | undefined;
  readonly family?: never;
  readonly imageRepository?: never;
}

/**
 * Which container a binding supplied at deploy time targets.
 *
 * The two forms simulated ECS already takes, a family with a container name
 * and an image repository, mean the same here as they do when a container is
 * bound directly. The third names the task definition Resource, which is what
 * a template has and a `RegisterTaskDefinition` call does not.
 */
export type SimCfnEcsContainerBindingTarget =
  | (SimEcsContainerBindingTarget & { readonly logicalId?: never })
  | SimCfnEcsTaskDefinitionBindingTarget;

/**
 * A real in-process handler bound at deploy time to a container an
 * `AWS::ECS::TaskDefinition` declares.
 *
 * ```typescript
 * await simAws.cloudFormation().deployTemplateFile({
 *   stackName: "orders",
 *   templateFile: "cdk.out/OrdersStack.template.json",
 *   bindings: [
 *     {
 *       family: "orders-worker",
 *       containerName: "app",
 *       run: async () => {
 *         await processOutstandingOrders();
 *       },
 *     },
 *   ],
 * });
 * ```
 *
 * A binding that resolves is held by the simulated ECS scope the Stack
 * deployed into, so a task run from that task definition runs the handler.
 */
export type SimCfnEcsContainerBinding = SimCfnEcsContainerBindingTarget &
  SimEcsContainerBindingHandler;

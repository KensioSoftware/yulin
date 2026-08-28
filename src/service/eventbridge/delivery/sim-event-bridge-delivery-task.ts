import { SimEcsTargetRun } from "../../ecs/target/sim-ecs-target-run.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { SimEventBridgeTargetNotFound } from "../error/sim-event-bridge-delivery.error.js";
import type { SimEventTargetEcs } from "../target/sim-event-target-ecs.js";
import type { SimEventBridgeDeliveryRequest } from "./sim-event-bridge-delivery.js";
import {
  assumeEventBridgeTargetRole,
  eventBridgeTargetRole,
} from "./sim-event-bridge-target-role.js";

interface SimEventBridgeDeliveryTaskProperties {
  readonly simAws: SimAws;
}

/**
 * An ECS task a simulated rule runs when it matches an event.
 *
 * This is the one target type that is not a delivery. Nothing receives the
 * event: the rule calls `ecs:RunTask` as the target's role, and what the
 * container reads comes from the target's `Input` as the task's overrides.
 *
 * The role is assumed in its own Account and the task is run in the cluster
 * ARN's, which are not necessarily the same one.
 */
export class SimEventBridgeDeliveryTask {
  private readonly simAws: SimAws;

  constructor(properties: SimEventBridgeDeliveryTaskProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Run the target's task as the target's role.
   */
  async deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    const arn = request.target.arn;
    const ecs = this.taskTarget(request);
    const role = eventBridgeTargetRole(ecs.roleArn);
    const roleScope = this.simAws.accountRegionScope(
      role.accountId,
      arn.regionName,
    );
    const caller = await assumeEventBridgeTargetRole(role, roleScope, {
      arn: request.ruleArn,
      accountId: request.ruleOwnerAccountId,
    });

    await new SimEcsTargetRun({
      scope: this.simAws.accountRegionScope(arn.accountId, arn.regionName),
    }).run({ cluster: arn.value, task: ecs.task, caller });
  }

  /**
   * What the target said about the task, which an ECS target always has.
   *
   * It is read here rather than assumed, because the target that reaches this
   * is chosen by the service its ARN names and that is one step removed from
   * the properties that were read off it.
   */
  private taskTarget(
    request: SimEventBridgeDeliveryRequest,
  ): SimEventTargetEcs {
    const ecs = request.target.ecs;

    if (ecs === undefined) {
      throw new SimEventBridgeTargetNotFound(
        `${request.target.arn.value} names an ECS cluster and the target ` +
          `carries no EcsParameters, so there is no task to run.`,
      );
    }

    return ecs;
  }
}

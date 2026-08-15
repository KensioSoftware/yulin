import { SimEcsTargetRun } from "../../ecs/target/sim-ecs-target-run.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { SimSchedulerTargetNotFound } from "../error/sim-scheduler-delivery.error.js";
import type { SimEcsTargetTask } from "../../ecs/target/sim-ecs-target-task.js";
import type { SimSchedulerAssumedDelivery } from "./sim-scheduler-delivery.js";

interface SimSchedulerDeliveryTaskProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * An ECS task a simulated schedule runs when it falls due.
 *
 * This is the one target type that is not an invocation. Nothing receives the
 * schedule's `Input`: a task has nowhere to receive a payload, so the `Input`
 * is read as the task's overrides instead, which is what puts a variable in
 * front of the container's code.
 *
 * The execution role has already been assumed by the time this runs, and the
 * task is run as that role, so a role without `ecs:RunTask` on the revision
 * fails the invocation in exactly the way a role without
 * `lambda:InvokeFunction` fails a function target.
 */
export class SimSchedulerDeliveryTask {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimSchedulerDeliveryTaskProperties) {
    this.scope = properties.scope;
  }

  /**
   * Run the target's task as the execution role.
   */
  async deliver(delivery: SimSchedulerAssumedDelivery): Promise<void> {
    const target = delivery.request.schedule.target;

    await new SimEcsTargetRun({ scope: this.scope }).run({
      cluster: target.arn.value,
      task: this.task(delivery),
      caller: delivery.caller,
    });
  }

  /**
   * What the target said about the task, which an ECS target always has.
   *
   * It is read here rather than assumed, because the target that reaches this
   * is chosen by the service its ARN names and that is one step removed from
   * the properties that were read off it.
   */
  private task(delivery: SimSchedulerAssumedDelivery): SimEcsTargetTask {
    const target = delivery.request.schedule.target;

    if (target.task === undefined) {
      throw new SimSchedulerTargetNotFound(
        `${target.arn.value} names an ECS cluster and the target carries no ` +
          `EcsParameters, so there is no task to run.`,
      );
    }

    return target.task;
  }
}

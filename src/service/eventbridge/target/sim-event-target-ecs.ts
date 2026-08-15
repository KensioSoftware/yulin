import {
  SimEcsTargetTask,
  type SimEcsTargetTaskProperties,
} from "../../ecs/target/sim-ecs-target-task.js";
import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../error/sim-event-bridge.error.js";
import type { SimEventTargetArn } from "./sim-event-target-arn.js";

/**
 * The shape an IAM role ARN has.
 */
const roleArnPattern = /^arn:aws[a-z-]*:iam::\d{12}:role\/.+$/u;

/**
 * What a target request says about running a task.
 */
export interface SimEventTargetTaskProperties extends SimEcsTargetTaskProperties {
  readonly RoleArn?: string | undefined;
}

/**
 * Refuse the task properties on a target that does not run a task.
 *
 * A `RoleArn` on a queue, topic or function target is the one refusal here
 * that is about EventBridge rather than about ECS: a rule reaches those three
 * as the `events.amazonaws.com` service principal and their own resource
 * policies decide, so a role would be taken and never used.
 */
function refuseTaskProperties(target: SimEventTargetTaskProperties): void {
  if (target.RoleArn !== undefined) {
    throw new SimEventBridgeUnsimulatedInputException(
      "A target RoleArn is not simulated except on an ECS target. A rule " +
        "reaches its target as the events.amazonaws.com service principal, " +
        "which the target's own resource policy admits.",
    );
  }

  if (target.EcsParameters !== undefined) {
    throw new SimEventBridgeUnsimulatedInputException(
      "EcsParameters belongs to a target whose Arn names an ECS cluster, " +
        "and this target's does not",
    );
  }
}

/**
 * How this reports a target that could never run the task it describes.
 */
function refuse(reason: string): Error {
  return new SimEventBridgeValidationException(
    `Invalid parameter: Targets Reason: ${reason}`,
  );
}

/**
 * What one rule target says about the ECS task it runs.
 *
 * A rule runs a task as the target's own role rather than as the EventBridge
 * service principal, which is why an ECS target is the one target type here
 * that carries a `RoleArn`. Real EventBridge requires one for exactly the same
 * reason: `ecs:RunTask` is a call it makes on the account's behalf rather than
 * a delivery a resource policy can admit.
 */
export class SimEventTargetEcs {
  public readonly roleArn: string;
  public readonly task: SimEcsTargetTask;

  private constructor(roleArn: string, task: SimEcsTargetTask) {
    this.roleArn = roleArn;
    this.task = task;
  }

  /**
   * Read what a target says about running a task, where it runs one.
   *
   * A target whose ARN names anything but an ECS cluster runs no task, and is
   * refused for carrying the properties of one rather than being taken with
   * them ignored.
   */
  static of(
    arn: SimEventTargetArn,
    target: SimEventTargetTaskProperties,
  ): SimEventTargetEcs | undefined {
    if (arn.service !== "ecs") {
      refuseTaskProperties(target);

      return undefined;
    }

    return new this(
      this.roleArnIn(target.RoleArn),
      SimEcsTargetTask.of(target, refuse),
    );
  }

  /**
   * Read the role the rule runs the task as, which it has to have.
   *
   * It is checked for being a role ARN when the target is added rather than
   * when an event first matches, so a target that could never run anything
   * says so at the point it was written.
   */
  private static roleArnIn(value: string | undefined): string {
    if (value === undefined || value === "") {
      throw refuse(
        "an ECS target runs its task as a role, so it carries a RoleArn",
      );
    }

    if (!roleArnPattern.test(value)) {
      throw refuse(
        `'${value}' is not an IAM role ARN. One is ` +
          `arn:aws:iam::<account-id>:role/<role-name>`,
      );
    }

    return value;
  }
}

import { SimEcsTargetTask } from "../../ecs/target/sim-ecs-target-task.js";
import {
  SimSchedulerUnsimulatedInputException,
  SimSchedulerValidationException,
} from "../error/sim-scheduler.error.js";
import { SimSchedulerTargetArn } from "./sim-scheduler-target-arn.js";
import {
  SimSchedulerDeadLetterConfig,
  type SimSchedulerDeadLetterConfigInput,
} from "./sim-scheduler-dead-letter-config.js";
import {
  SimSchedulerRetryPolicy,
  type SimSchedulerRetryPolicyInput,
} from "./sim-scheduler-retry-policy.js";

/**
 * The longest role ARN AWS takes, and the shape one has to be.
 */
const roleArn = /^arn:aws[a-z-]*:iam::\d{12}:role\/.+$/u;

/**
 * What a target request says, of the parts a target reads.
 */
interface SimSchedulerRequestedTarget {
  readonly Arn?: string | undefined;
  readonly RoleArn?: string | undefined;
  readonly Input?: string | undefined;
  readonly EcsParameters?: unknown;
  readonly DeadLetterConfig?: SimSchedulerDeadLetterConfigInput | undefined;
  readonly RetryPolicy?: SimSchedulerRetryPolicyInput | undefined;
}

interface SimSchedulerTargetProperties {
  readonly arn: SimSchedulerTargetArn;
  readonly roleArn: string;
  readonly input: string | undefined;
  readonly task: SimEcsTargetTask | undefined;
  readonly deadLetterConfig: SimSchedulerDeadLetterConfig | undefined;
  readonly retryPolicy: SimSchedulerRetryPolicy | undefined;
}

/**
 * How this reports a target that could never run the task it describes.
 */
function refuse(reason: string): Error {
  return new SimSchedulerValidationException(
    `Invalid parameter: Target Reason: ${reason}`,
  );
}

/**
 * What one schedule invokes, and who it invokes it as.
 *
 * The `RoleArn` is the whole of the difference between this and an EventBridge
 * rule target. A rule reaches its target as the `events.amazonaws.com` service
 * principal and the target's own resource policy decides; a schedule assumes
 * this role and is authorized by that role's identity policies, with no
 * resource policy involved at all. Both are required by AWS, which is why
 * neither is optional here.
 */
export class SimSchedulerTarget {
  public readonly arn: SimSchedulerTargetArn;
  public readonly roleArn: string;

  /**
   * The fixed JSON the target receives in place of an empty payload.
   *
   * Scheduler has no event of its own to send, so a target with no `Input` is
   * invoked with nothing rather than with an envelope describing the schedule.
   */
  public readonly input: string | undefined;

  /**
   * The ECS task this target runs, where its ARN names a cluster.
   *
   * An ECS target is the one target type here whose `Input` is not what the
   * target receives: a task has nowhere to receive a payload, so the `Input` is
   * what the task overrides instead.
   */
  public readonly task: SimEcsTargetTask | undefined;
  public readonly deadLetterConfig: SimSchedulerDeadLetterConfig | undefined;
  public readonly retryPolicy: SimSchedulerRetryPolicy | undefined;

  private constructor(properties: SimSchedulerTargetProperties) {
    this.arn = properties.arn;
    this.roleArn = properties.roleArn;
    this.input = properties.input;
    this.task = properties.task;
    this.deadLetterConfig = properties.deadLetterConfig;
    this.retryPolicy = properties.retryPolicy;
  }

  /**
   * Read the target a request carries.
   */
  static of(
    target: SimSchedulerRequestedTarget | undefined,
  ): SimSchedulerTarget {
    if (target === undefined) {
      throw new SimSchedulerValidationException("Target is required");
    }

    const arn = SimSchedulerTargetArn.of(target.Arn);

    return new this({
      arn,
      roleArn: this.roleArnIn(target.RoleArn),
      input: target.Input,
      task: this.taskIn(arn, target),
      deadLetterConfig:
        target.DeadLetterConfig === undefined
          ? undefined
          : SimSchedulerDeadLetterConfig.of(target.DeadLetterConfig),
      retryPolicy:
        target.RetryPolicy === undefined
          ? undefined
          : SimSchedulerRetryPolicy.of(target.RetryPolicy),
    });
  }

  /**
   * Read what the target says about the task it runs, where it runs one.
   *
   * A target whose ARN names anything but an ECS cluster runs no task, and
   * `EcsParameters` on one is refused rather than taken and ignored: a target
   * that looks configured to whoever wrote it and behaves as though it is not
   * is the answer worth avoiding.
   */
  private static taskIn(
    arn: SimSchedulerTargetArn,
    target: SimSchedulerRequestedTarget,
  ): SimEcsTargetTask | undefined {
    if (arn.service === "ecs") {
      return SimEcsTargetTask.of(target, refuse);
    }

    if (target.EcsParameters !== undefined) {
      throw new SimSchedulerUnsimulatedInputException(
        "EcsParameters belongs to a target whose Arn names an ECS cluster, " +
          "and this target's does not.",
      );
    }

    return undefined;
  }

  /**
   * Read the execution role a schedule invokes its target as.
   *
   * It is required, and it is checked for being a role ARN here rather than
   * when the schedule falls due, so a schedule that could never invoke
   * anything says so when it is written.
   */
  private static roleArnIn(value: string | undefined): string {
    if (value === undefined || value === "") {
      throw new SimSchedulerValidationException("Target RoleArn is required");
    }

    if (!roleArn.test(value)) {
      throw new SimSchedulerValidationException(
        `Invalid parameter: Target RoleArn Reason: '${value}' is not an IAM ` +
          `role ARN. One is arn:aws:iam::<account-id>:role/<role-name>`,
      );
    }

    return value;
  }
}

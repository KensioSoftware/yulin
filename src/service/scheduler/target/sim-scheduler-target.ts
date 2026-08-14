import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";
import { SimSchedulerTargetArn } from "./sim-scheduler-target-arn.js";

/**
 * The longest role ARN AWS takes, and the shape one has to be.
 */
const roleArn = /^arn:aws[a-z-]*:iam::\d{12}:role\/.+$/u;

interface SimSchedulerTargetProperties {
  readonly arn: SimSchedulerTargetArn;
  readonly roleArn: string;
  readonly input: string | undefined;
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

  private constructor(properties: SimSchedulerTargetProperties) {
    this.arn = properties.arn;
    this.roleArn = properties.roleArn;
    this.input = properties.input;
  }

  /**
   * Read the target a request carries.
   */
  static of(
    target:
      | {
          readonly Arn?: string | undefined;
          readonly RoleArn?: string | undefined;
          readonly Input?: string | undefined;
        }
      | undefined,
  ): SimSchedulerTarget {
    if (target === undefined) {
      throw new SimSchedulerValidationException("Target is required");
    }

    return new this({
      arn: SimSchedulerTargetArn.of(target.Arn),
      roleArn: this.roleArnIn(target.RoleArn),
      input: target.Input,
    });
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

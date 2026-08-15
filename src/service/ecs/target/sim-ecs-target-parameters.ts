import { isRecord } from "../../../util/type-guard/record.js";

/**
 * Minimal structural `EcsParameters`, as an EventBridge rule target and a
 * Scheduler schedule target both carry it.
 *
 * The two services name these the same things and mean the same things by
 * them, so one shape serves both.
 *
 * https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_EcsParameters.html
 */
export interface SimEcsTargetParametersType {
  readonly TaskDefinitionArn?: string | undefined;
  readonly TaskCount?: number | undefined;
  readonly LaunchType?: string | undefined;
  readonly PlatformVersion?: string | undefined;
  readonly NetworkConfiguration?: unknown;
  readonly CapacityProviderStrategy?: unknown;
}

/**
 * What a target may say about the task it runs.
 *
 * The first two decide what runs and how many of it. The other four describe
 * where a real task would be placed and what it would be attached to, and there
 * is no placement and no network here, so they are taken and ignored rather
 * than refused: a target written for real AWS carries them, and refusing one
 * would make an otherwise workable target unusable.
 */
const accepted: ReadonlySet<string> = new Set([
  "TaskDefinitionArn",
  "TaskCount",
  "LaunchType",
  "PlatformVersion",
  "NetworkConfiguration",
  "CapacityProviderStrategy",
]);

/**
 * The most tasks one target may run, as both services limit it.
 */
const maximumTaskCount = 10;

/**
 * How many tasks a target with no `TaskCount` runs.
 */
const defaultTaskCount = 1;

/**
 * The `EcsParameters` one target carries.
 *
 * Reading them is the same job for both services, and the refusals are the
 * same refusals, so the only thing either service supplies is the error to
 * raise. That keeps a message reading as EventBridge's or Scheduler's own
 * while there is one answer to what a target may ask for.
 */
export class SimEcsTargetParameters {
  public readonly taskDefinitionArn: string;
  public readonly taskCount: number;

  /**
   * The parameters as the request wrote them, for reporting them back.
   */
  public readonly declared: SimEcsTargetParametersType;

  private constructor(
    declared: SimEcsTargetParametersType,
    taskDefinitionArn: string,
    taskCount: number,
  ) {
    this.declared = declared;
    this.taskDefinitionArn = taskDefinitionArn;
    this.taskCount = taskCount;
  }

  /**
   * Read the parameters a target carries, refusing what cannot be run.
   *
   * A target naming an ECS cluster and no task definition names nothing to
   * run, so it is refused where it was written rather than at the first
   * delivery.
   */
  static of(
    parameters: unknown,
    refuse: (reason: string) => Error,
  ): SimEcsTargetParameters {
    if (!isRecord(parameters)) {
      throw refuse(
        "EcsParameters is required on a target that runs an ECS task, and " +
          "names at least a TaskDefinitionArn",
      );
    }

    this.refuseUnaccepted(parameters, refuse);

    // Copied rather than held by reference, the way a `RunTask` override is,
    // since the caller owns what it passed in and this is read again every
    // time the target runs and every time it is reported back.
    const declared = structuredClone(parameters);

    return new this(
      declared,
      this.taskDefinitionArnIn(declared["TaskDefinitionArn"], refuse),
      this.taskCountIn(declared["TaskCount"], refuse),
    );
  }

  /**
   * Refuse anything the parameters carry that this simulation does not hold.
   *
   * Working from what is accepted rather than from a list of everything ECS
   * offers is what makes a parameter nobody thought about refused rather than
   * dropped, which is the failure mode worth avoiding: a target that looks
   * configured and behaves as though it is not.
   */
  private static refuseUnaccepted(
    parameters: Record<string, unknown>,
    refuse: (reason: string) => Error,
  ): void {
    for (const [name, value] of Object.entries(parameters)) {
      if (value !== undefined && !accepted.has(name)) {
        throw refuse(
          `EcsParameters ${name} is not simulated, so a target carrying one ` +
            `is refused rather than taken with it dropped`,
        );
      }
    }
  }

  /**
   * The task definition the target runs, which has to be named as a string.
   *
   * The type is checked as well as the value because these arrive as `unknown`:
   * a target written in a template, or in JavaScript, can carry a number or a
   * null here, and one of those reaching the task definition reader is a type
   * error a long way from the target that caused it.
   */
  private static taskDefinitionArnIn(
    value: unknown,
    refuse: (reason: string) => Error,
  ): string {
    if (typeof value !== "string" || value === "") {
      throw refuse(
        "EcsParameters TaskDefinitionArn is required, as a family, a " +
          "family:revision or an ARN: a target that runs a task says which " +
          "task definition it runs",
      );
    }

    return value;
  }

  private static taskCountIn(
    value: unknown,
    refuse: (reason: string) => Error,
  ): number {
    if (value === undefined) {
      return defaultTaskCount;
    }

    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > maximumTaskCount
    ) {
      throw refuse(
        `EcsParameters TaskCount is a whole number from 1 to ${String(
          maximumTaskCount,
        )}`,
      );
    }

    return value;
  }
}

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsTargetParametersType } from "../../../ecs/target/sim-ecs-target-parameters.js";

/**
 * The target properties a simulated schedule reads.
 *
 * Real Scheduler carries a great deal more on a target, all of it for services
 * this simulation does not invoke or behaviour it does not model. Everything
 * absent here is refused rather than dropped.
 */
export interface SimSchedulerRequestTarget {
  readonly Arn?: string | undefined;
  readonly RoleArn?: string | undefined;
  readonly Input?: string | undefined;
  readonly DeadLetterConfig?: SimSchedulerDeadLetterConfig | undefined;
  readonly RetryPolicy?: SimSchedulerRetryPolicy | undefined;
  readonly EcsParameters?: SimEcsTargetParametersType | undefined;
  readonly EventBridgeParameters?: unknown;
  readonly KinesisParameters?: unknown;
  readonly SageMakerPipelineParameters?: unknown;
  readonly SqsParameters?: unknown;
}

export interface SimSchedulerDeadLetterConfig {
  readonly Arn?: string | undefined;
}

export interface SimSchedulerRetryPolicy {
  readonly MaximumEventAgeInSeconds?: number | undefined;
  readonly MaximumRetryAttempts?: number | undefined;
}

/**
 * The time window a schedule invokes its target in.
 */
export interface SimSchedulerFlexibleTimeWindow {
  readonly Mode?: string | undefined;
  readonly MaximumWindowInMinutes?: number | undefined;
}

/**
 * What Create and Update both carry, which is the whole of a schedule.
 *
 * UpdateSchedule replaces rather than merges on real AWS, so the two requests
 * take the same properties and mean the same thing by them.
 */
export interface SimSchedulerScheduleInput {
  readonly Name?: string | undefined;
  readonly GroupName?: string | undefined;
  readonly ScheduleExpression?: string | undefined;
  readonly ScheduleExpressionTimezone?: string | undefined;
  readonly FlexibleTimeWindow?: SimSchedulerFlexibleTimeWindow | undefined;
  readonly Target?: SimSchedulerRequestTarget | undefined;
  readonly State?: string | undefined;
  readonly Description?: string | undefined;
  readonly ActionAfterCompletion?: string | undefined;
  readonly StartDate?: Date | undefined;
  readonly EndDate?: Date | undefined;
  readonly KmsKeyArn?: string | undefined;
  readonly ClientToken?: string | undefined;
}

/**
 * Minimal structural sim Scheduler CreateSchedule command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_CreateSchedule.html
 */
export interface SimCreateScheduleCommand {
  readonly input: SimSchedulerScheduleInput;
}

export interface SimCreateScheduleCommandOutput {
  readonly ScheduleArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Scheduler UpdateSchedule command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_UpdateSchedule.html
 */
export interface SimUpdateScheduleCommand {
  readonly input: SimSchedulerScheduleInput;
}

export interface SimUpdateScheduleCommandOutput {
  readonly ScheduleArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Scheduler GetSchedule command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_GetSchedule.html
 */
export interface SimGetScheduleCommand {
  readonly input: SimGetScheduleCommandInput;
}

export interface SimGetScheduleCommandInput {
  readonly Name?: string | undefined;
  readonly GroupName?: string | undefined;
}

export interface SimGetScheduleCommandOutput {
  readonly Arn?: string | undefined;
  readonly Name?: string | undefined;
  readonly GroupName?: string | undefined;
  readonly ScheduleExpression?: string | undefined;
  readonly State?: string | undefined;
  readonly Description?: string | undefined;
  readonly ActionAfterCompletion?: string | undefined;
  readonly FlexibleTimeWindow?: SimSchedulerFlexibleTimeWindow | undefined;
  readonly Target?: SimSchedulerRequestTarget | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModificationDate?: Date | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Scheduler DeleteSchedule command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_DeleteSchedule.html
 */
export interface SimDeleteScheduleCommand {
  readonly input: SimDeleteScheduleCommandInput;
}

export interface SimDeleteScheduleCommandInput {
  readonly Name?: string | undefined;
  readonly GroupName?: string | undefined;
  readonly ClientToken?: string | undefined;
}

export interface SimDeleteScheduleCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * One schedule as a listing reports it.
 *
 * A listing is deliberately thinner than a describe on real Scheduler: it
 * carries the target's ARN and nothing else about the target, and it carries no
 * expression at all.
 */
export interface SimSchedulerListedSchedule {
  readonly Arn: string;
  readonly Name: string;
  readonly GroupName: string;
  readonly State: string;
  readonly Target: { readonly Arn: string };
  readonly CreationDate: Date;
  readonly LastModificationDate: Date;
}

/**
 * Minimal structural sim Scheduler ListSchedules command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_ListSchedules.html
 */
export interface SimListSchedulesCommand {
  readonly input: SimListSchedulesCommandInput;
}

export interface SimListSchedulesCommandInput {
  readonly GroupName?: string | undefined;
  readonly NamePrefix?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
  readonly State?: string | undefined;
}

export interface SimListSchedulesCommandOutput {
  readonly Schedules?: readonly SimSchedulerListedSchedule[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

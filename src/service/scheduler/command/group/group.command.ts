import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * One tag a request asks to put on a schedule group.
 *
 * Read only so the group commands can refuse them. Nothing here stores a tag,
 * and a group carrying one it never got would be worse than the refusal.
 */
export interface SimSchedulerTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim Scheduler CreateScheduleGroup command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_CreateScheduleGroup.html
 */
export interface SimCreateScheduleGroupCommand {
  readonly input: SimCreateScheduleGroupCommandInput;
}

export interface SimCreateScheduleGroupCommandInput {
  readonly Name?: string | undefined;
  readonly Tags?: readonly SimSchedulerTag[] | undefined;
  readonly ClientToken?: string | undefined;
}

export interface SimCreateScheduleGroupCommandOutput {
  readonly ScheduleGroupArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Scheduler GetScheduleGroup command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_GetScheduleGroup.html
 */
export interface SimGetScheduleGroupCommand {
  readonly input: SimGetScheduleGroupCommandInput;
}

export interface SimGetScheduleGroupCommandInput {
  readonly Name?: string | undefined;
}

export interface SimGetScheduleGroupCommandOutput {
  readonly Arn?: string | undefined;
  readonly Name?: string | undefined;
  readonly State?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModificationDate?: Date | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Scheduler DeleteScheduleGroup command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_DeleteScheduleGroup.html
 */
export interface SimDeleteScheduleGroupCommand {
  readonly input: SimDeleteScheduleGroupCommandInput;
}

export interface SimDeleteScheduleGroupCommandInput {
  readonly Name?: string | undefined;
  readonly ClientToken?: string | undefined;
}

export interface SimDeleteScheduleGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * One schedule group as a listing reports it, which is all of it.
 */
export interface SimSchedulerListedScheduleGroup {
  readonly Arn: string;
  readonly Name: string;
  readonly State: string;
  readonly CreationDate: Date;
  readonly LastModificationDate: Date;
}

/**
 * Minimal structural sim Scheduler ListScheduleGroups command.
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_ListScheduleGroups.html
 */
export interface SimListScheduleGroupsCommand {
  readonly input: SimListScheduleGroupsCommandInput;
}

export interface SimListScheduleGroupsCommandInput {
  readonly NamePrefix?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListScheduleGroupsCommandOutput {
  readonly ScheduleGroups?:
    | readonly SimSchedulerListedScheduleGroup[]
    | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

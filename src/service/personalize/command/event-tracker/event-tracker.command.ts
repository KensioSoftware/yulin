import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimPersonalizeTag } from "../dataset-group/dataset-group.command.js";

/**
 * Minimal structural sim Personalize CreateEventTracker command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/CreateEventTrackerCommand/
 */
export interface SimCreateEventTrackerCommand {
  readonly input: SimCreateEventTrackerCommandInput;
}

export interface SimCreateEventTrackerCommandInput {
  readonly name?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly tags?: readonly SimPersonalizeTag[] | undefined;
}

export interface SimCreateEventTrackerCommandOutput {
  readonly eventTrackerArn?: string | undefined;
  readonly trackingId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * An event tracker as Describe reports it.
 */
export interface SimPersonalizeEventTrackerDetail {
  readonly name?: string | undefined;
  readonly eventTrackerArn?: string | undefined;
  readonly accountId?: string | undefined;
  readonly trackingId?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize DescribeEventTracker command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DescribeEventTrackerCommand/
 */
export interface SimDescribeEventTrackerCommand {
  readonly input: SimDescribeEventTrackerCommandInput;
}

export interface SimDescribeEventTrackerCommandInput {
  readonly eventTrackerArn?: string | undefined;
}

export interface SimDescribeEventTrackerCommandOutput {
  readonly eventTracker?: SimPersonalizeEventTrackerDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * An event tracker as List reports it.
 *
 * Real Personalize leaves the tracking ID out of the summary. Only Describe
 * reports it.
 */
export interface SimPersonalizeEventTrackerSummary {
  readonly name?: string | undefined;
  readonly eventTrackerArn?: string | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize ListEventTrackers command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/ListEventTrackersCommand/
 */
export interface SimListEventTrackersCommand {
  readonly input?: SimListEventTrackersCommandInput | undefined;
}

export interface SimListEventTrackersCommandInput {
  readonly datasetGroupArn?: string | undefined;
  readonly nextToken?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SimListEventTrackersCommandOutput {
  readonly eventTrackers?:
    | readonly SimPersonalizeEventTrackerSummary[]
    | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize DeleteEventTracker command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DeleteEventTrackerCommand/
 */
export interface SimDeleteEventTrackerCommand {
  readonly input: SimDeleteEventTrackerCommandInput;
}

export interface SimDeleteEventTrackerCommandInput {
  readonly eventTrackerArn?: string | undefined;
}

export interface SimDeleteEventTrackerCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

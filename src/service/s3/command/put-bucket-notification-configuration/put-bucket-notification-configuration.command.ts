import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 PutBucketNotificationConfiguration command.
 */
export interface SimPutBucketNotificationConfigurationCommand {
  readonly input: SimPutBucketNotificationConfigurationCommandInput;
}

/**
 * Minimal structural sim S3 PutBucketNotificationConfiguration input.
 */
export interface SimPutBucketNotificationConfigurationCommandInput {
  readonly Bucket?: string | undefined;
  readonly NotificationConfiguration?:
    SimS3NotificationConfigurationInput | undefined;
  readonly SkipDestinationValidation?: boolean | undefined;
}

/**
 * Minimal structural sim S3 PutBucketNotificationConfiguration output.
 */
export interface SimPutBucketNotificationConfigurationCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim S3 notification configuration.
 *
 * The four destination groups are nested under this on the way in and sit at
 * the top level of the GetBucketNotificationConfiguration response on the way
 * out, which is what real S3 does and what
 * SimS3NotificationConfigurationOutput exists to say.
 */
export interface SimS3NotificationConfigurationInput {
  readonly LambdaFunctionConfigurations?:
    readonly SimS3LambdaFunctionConfigurationInput[] | undefined;
  readonly QueueConfigurations?:
    readonly SimS3QueueConfigurationInput[] | undefined;
  readonly TopicConfigurations?: readonly unknown[] | undefined;
  readonly EventBridgeConfiguration?: object | undefined;
}

/**
 * Minimal structural sim S3 Lambda function notification configuration.
 */
export interface SimS3LambdaFunctionConfigurationInput {
  readonly Id?: string | undefined;
  readonly LambdaFunctionArn?: string | undefined;
  readonly Events?: readonly string[] | undefined;
  readonly Filter?: SimS3NotificationFilterInput | undefined;
}

/**
 * Minimal structural sim S3 SQS queue notification configuration.
 */
export interface SimS3QueueConfigurationInput {
  readonly Id?: string | undefined;
  readonly QueueArn?: string | undefined;
  readonly Events?: readonly string[] | undefined;
  readonly Filter?: SimS3NotificationFilterInput | undefined;
}

/**
 * Minimal structural sim S3 notification object key filter.
 */
export interface SimS3NotificationFilterInput {
  readonly Key?: SimS3NotificationKeyFilterInput | undefined;
}

/**
 * Minimal structural sim S3 notification object key filter rules.
 */
export interface SimS3NotificationKeyFilterInput {
  readonly FilterRules?:
    readonly SimS3NotificationFilterRuleInput[] | undefined;
}

/**
 * Minimal structural sim S3 notification object key filter rule.
 */
export interface SimS3NotificationFilterRuleInput {
  readonly Name?: string | undefined;
  readonly Value?: string | undefined;
}

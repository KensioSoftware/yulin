import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimS3LambdaFunctionConfigurationInput,
  SimS3QueueConfigurationInput,
  SimS3TopicConfigurationInput,
} from "../put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";

/**
 * Minimal structural sim S3 GetBucketNotificationConfiguration command.
 */
export interface SimGetBucketNotificationConfigurationCommand {
  readonly input: SimGetBucketNotificationConfigurationCommandInput;
}

/**
 * Minimal structural sim S3 GetBucketNotificationConfiguration input.
 */
export interface SimGetBucketNotificationConfigurationCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * The destination groups a notification configuration is read back as.
 *
 * These sit at the top level of the response rather than under a
 * `NotificationConfiguration` property, which is where the same groups go on
 * the way in. The asymmetry is real S3's, and the SDK carries it: the output
 * type extends the configuration shape while the input type nests it. Reading
 * `result.NotificationConfiguration` compiles and answers undefined, which
 * looks exactly like a Bucket with nothing configured.
 */
export interface SimS3NotificationConfigurationOutput {
  readonly LambdaFunctionConfigurations?:
    | readonly SimS3LambdaFunctionConfigurationInput[]
    | undefined;
  readonly QueueConfigurations?:
    | readonly SimS3QueueConfigurationInput[]
    | undefined;
  readonly TopicConfigurations?:
    | readonly SimS3TopicConfigurationInput[]
    | undefined;
}

/**
 * Minimal structural sim S3 GetBucketNotificationConfiguration output.
 */
export interface SimGetBucketNotificationConfigurationCommandOutput extends SimS3NotificationConfigurationOutput {
  readonly $metadata: SimResponseMetadata;
}

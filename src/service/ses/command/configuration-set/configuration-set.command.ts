import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * The reasons a configuration set suppresses for, as the SES v2 API carries
 * them.
 */
export interface SimSesSuppressionOptions {
  readonly SuppressedReasons?: readonly string[] | undefined;
}

/**
 * Whether sending through a configuration set is on.
 */
export interface SimSesSendingOptions {
  readonly SendingEnabled?: boolean | undefined;
}

/**
 * How a configuration set asks for its messages to be handed on.
 */
export interface SimSesDeliveryOptions {
  readonly TlsPolicy?: string | undefined;
  readonly SendingPoolName?: string | undefined;
  readonly MaxDeliverySeconds?: number | undefined;
}

/**
 * Whether reputation metrics are published for a configuration set.
 */
export interface SimSesReputationOptions {
  readonly ReputationMetricsEnabled?: boolean | undefined;
}

/**
 * Minimal structural sim SES v2 CreateConfigurationSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/CreateConfigurationSetCommand/
 */
export interface SimCreateConfigurationSetCommand {
  readonly input: SimCreateConfigurationSetCommandInput;
}

export interface SimCreateConfigurationSetCommandInput {
  readonly ConfigurationSetName?: string | undefined;
  readonly SuppressionOptions?: SimSesSuppressionOptions | undefined;
  readonly SendingOptions?: SimSesSendingOptions | undefined;
  readonly DeliveryOptions?: SimSesDeliveryOptions | undefined;
  readonly ReputationOptions?: SimSesReputationOptions | undefined;
  readonly TrackingOptions?: object | undefined;
  readonly VdmOptions?: object | undefined;
  readonly Tags?: readonly unknown[] | undefined;
}

export interface SimCreateConfigurationSetCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 GetConfigurationSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/GetConfigurationSetCommand/
 */
export interface SimGetConfigurationSetCommand {
  readonly input: SimGetConfigurationSetCommandInput;
}

export interface SimGetConfigurationSetCommandInput {
  readonly ConfigurationSetName?: string | undefined;
}

export interface SimGetConfigurationSetCommandOutput {
  readonly ConfigurationSetName?: string | undefined;
  readonly SuppressionOptions?: SimSesSuppressionOptions | undefined;
  readonly SendingOptions?: SimSesSendingOptions | undefined;
  readonly DeliveryOptions?: SimSesDeliveryOptions | undefined;
  readonly ReputationOptions?: SimSesReputationOptions | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 ListConfigurationSets command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/ListConfigurationSetsCommand/
 */
export interface SimListConfigurationSetsCommand {
  readonly input: SimListConfigurationSetsCommandInput;
}

export interface SimListConfigurationSetsCommandInput {
  readonly PageSize?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListConfigurationSetsCommandOutput {
  readonly ConfigurationSets?: readonly string[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 DeleteConfigurationSet command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/DeleteConfigurationSetCommand/
 */
export interface SimDeleteConfigurationSetCommand {
  readonly input: SimDeleteConfigurationSetCommandInput;
}

export interface SimDeleteConfigurationSetCommandInput {
  readonly ConfigurationSetName?: string | undefined;
}

export interface SimDeleteConfigurationSetCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

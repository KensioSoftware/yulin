import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim SNS CheckIfPhoneNumberIsOptedOut command.
 *
 * The SMS operations name their fields in camel case, unlike every other SNS
 * operation. That is how the SNS API has them, and the SDK carries it through.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/CheckIfPhoneNumberIsOptedOutCommand/
 */
export interface SimCheckIfPhoneNumberIsOptedOutCommand {
  readonly input: SimCheckIfPhoneNumberIsOptedOutCommandInput;
}

export interface SimCheckIfPhoneNumberIsOptedOutCommandInput {
  readonly phoneNumber?: string | undefined;
}

export interface SimCheckIfPhoneNumberIsOptedOutCommandOutput {
  readonly isOptedOut?: boolean | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS ListPhoneNumbersOptedOut command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/ListPhoneNumbersOptedOutCommand/
 */
export interface SimListPhoneNumbersOptedOutCommand {
  readonly input: SimListPhoneNumbersOptedOutCommandInput;
}

export interface SimListPhoneNumbersOptedOutCommandInput {
  readonly nextToken?: string | undefined;
}

export interface SimListPhoneNumbersOptedOutCommandOutput {
  readonly phoneNumbers?: readonly string[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS OptInPhoneNumber command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/OptInPhoneNumberCommand/
 */
export interface SimOptInPhoneNumberCommand {
  readonly input: SimOptInPhoneNumberCommandInput;
}

export interface SimOptInPhoneNumberCommandInput {
  readonly phoneNumber?: string | undefined;
}

export interface SimOptInPhoneNumberCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimIamPolicyDocument } from "../../../iam/policy/sim-iam-policy.js";
import type { SimKmsKeyMetadata } from "../../key/sim-kms-key-metadata.js";
import type { SimKmsKeyState } from "../../key/sim-kms-key.js";

/**
 * Minimal structural sim KMS CreateKey command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/CreateKeyCommand/
 */
export interface SimCreateKeyCommand {
  readonly input: SimCreateKeyCommandInput;
}

export interface SimCreateKeyCommandInput {
  readonly Description?: string | undefined;

  /**
   * The key policy, as a JSON document string, exactly as the real API takes
   * it. Omitting it gets the default policy KMS applies, which delegates to
   * the Account's IAM.
   */
  readonly Policy?: string | undefined;

  readonly KeyUsage?: string | undefined;
  readonly KeySpec?: string | undefined;
  readonly Origin?: string | undefined;
}

export interface SimCreateKeyCommandOutput {
  readonly KeyMetadata?: SimKmsKeyMetadata | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS DescribeKey command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/DescribeKeyCommand/
 */
export interface SimDescribeKeyCommand {
  readonly input: SimDescribeKeyCommandInput;
}

export interface SimDescribeKeyCommandInput {
  readonly KeyId?: string | undefined;
}

export interface SimDescribeKeyCommandOutput {
  readonly KeyMetadata?: SimKmsKeyMetadata | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS ListKeys command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/ListKeysCommand/
 */
export interface SimListKeysCommand {
  readonly input?: SimListKeysCommandInput | undefined;
}

export interface SimListKeysCommandInput {
  readonly Limit?: number | undefined;
}

export interface SimListKeysCommandEntry {
  readonly KeyId: string;
  readonly KeyArn: string;
}

export interface SimListKeysCommandOutput {
  readonly Keys?: readonly SimListKeysCommandEntry[] | undefined;
  readonly Truncated?: boolean | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS GetKeyPolicy command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/GetKeyPolicyCommand/
 */
export interface SimGetKeyPolicyCommand {
  readonly input: SimGetKeyPolicyCommandInput;
}

export interface SimGetKeyPolicyCommandInput {
  readonly KeyId?: string | undefined;
  readonly PolicyName?: string | undefined;
}

export interface SimGetKeyPolicyCommandOutput {
  readonly Policy?: string | undefined;
  readonly PolicyName?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS PutKeyPolicy command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/PutKeyPolicyCommand/
 */
export interface SimPutKeyPolicyCommand {
  readonly input: SimPutKeyPolicyCommandInput;
}

export interface SimPutKeyPolicyCommandInput {
  readonly KeyId?: string | undefined;
  readonly Policy?: string | SimIamPolicyDocument | undefined;
  readonly PolicyName?: string | undefined;
}

export interface SimPutKeyPolicyCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS EnableKey command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/EnableKeyCommand/
 */
export interface SimEnableKeyCommand {
  readonly input: SimEnableKeyCommandInput;
}

export interface SimEnableKeyCommandInput {
  readonly KeyId?: string | undefined;
}

export interface SimEnableKeyCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS DisableKey command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/DisableKeyCommand/
 */
export interface SimDisableKeyCommand {
  readonly input: SimDisableKeyCommandInput;
}

export interface SimDisableKeyCommandInput {
  readonly KeyId?: string | undefined;
}

export interface SimDisableKeyCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS ScheduleKeyDeletion command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/ScheduleKeyDeletionCommand/
 */
export interface SimScheduleKeyDeletionCommand {
  readonly input: SimScheduleKeyDeletionCommandInput;
}

export interface SimScheduleKeyDeletionCommandInput {
  readonly KeyId?: string | undefined;
  readonly PendingWindowInDays?: number | undefined;
}

export interface SimScheduleKeyDeletionCommandOutput {
  readonly KeyId?: string | undefined;
  readonly DeletionDate?: Date | undefined;
  readonly KeyState?: SimKmsKeyState | undefined;
  readonly PendingWindowInDays?: number | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS CancelKeyDeletion command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/CancelKeyDeletionCommand/
 */
export interface SimCancelKeyDeletionCommand {
  readonly input: SimCancelKeyDeletionCommandInput;
}

export interface SimCancelKeyDeletionCommandInput {
  readonly KeyId?: string | undefined;
}

export interface SimCancelKeyDeletionCommandOutput {
  readonly KeyId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

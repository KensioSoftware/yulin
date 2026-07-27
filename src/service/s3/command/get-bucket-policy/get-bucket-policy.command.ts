import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 GetBucketPolicy command.
 */
export interface SimGetBucketPolicyCommand {
  readonly input: SimGetBucketPolicyCommandInput;
}

/**
 * Minimal structural sim S3 GetBucketPolicy input.
 */
export interface SimGetBucketPolicyCommandInput {
  readonly Bucket?: string | undefined;
}

/**
 * Minimal structural sim S3 GetBucketPolicy output.
 *
 * Real S3 answers with the policy document as a JSON string, so the simulator
 * serializes its stored document rather than returning the parsed shape.
 */
export interface SimGetBucketPolicyCommandOutput {
  readonly Policy: string;
  readonly $metadata: SimResponseMetadata;
}

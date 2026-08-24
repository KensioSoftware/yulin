import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 PutBucketLifecycleConfiguration command.
 */
export interface SimPutBucketLifecycleConfigurationCommand {
  readonly input: SimPutBucketLifecycleConfigurationCommandInput;
}

/**
 * Minimal structural sim S3 PutBucketLifecycleConfiguration input.
 */
export interface SimPutBucketLifecycleConfigurationCommandInput {
  readonly Bucket?: string | undefined;
  readonly LifecycleConfiguration?: SimS3LifecycleConfiguration | undefined;
}

/**
 * Minimal structural sim S3 PutBucketLifecycleConfiguration output.
 */
export interface SimPutBucketLifecycleConfigurationCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim S3 lifecycle configuration.
 *
 * A Bucket has one of these rather than a list of them, so a put replaces
 * whatever was there instead of adding to it.
 */
export interface SimS3LifecycleConfiguration {
  readonly Rules?: readonly SimS3LifecycleRule[] | undefined;
}

/**
 * Minimal structural sim S3 lifecycle rule.
 *
 * Simulated S3 holds a rule and hands it back. Nothing expires or transitions
 * an Object, which is why the fields carry no more type than the SDK gives
 * them.
 */
export interface SimS3LifecycleRule {
  readonly ID?: string | undefined;
  readonly Status?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly Filter?: SimS3LifecycleRuleFilter | undefined;
  readonly Expiration?: SimS3LifecycleExpiration | undefined;
  readonly Transitions?: readonly SimS3LifecycleTransition[] | undefined;
  readonly AbortIncompleteMultipartUpload?:
    | SimS3LifecycleAbortIncompleteMultipartUpload
    | undefined;
  readonly NoncurrentVersionExpiration?:
    | SimS3LifecycleNoncurrentVersionExpiration
    | undefined;
  readonly NoncurrentVersionTransitions?:
    | readonly SimS3LifecycleNoncurrentVersionTransition[]
    | undefined;
}

/**
 * Minimal structural sim S3 lifecycle rule filter.
 */
export interface SimS3LifecycleRuleFilter {
  readonly Prefix?: string | undefined;
  readonly Tag?: SimS3LifecycleTag | undefined;
  readonly And?: SimS3LifecycleRuleAndOperator | undefined;
  readonly ObjectSizeGreaterThan?: number | undefined;
  readonly ObjectSizeLessThan?: number | undefined;
}

/**
 * Minimal structural sim S3 lifecycle rule filter conjunction.
 */
export interface SimS3LifecycleRuleAndOperator {
  readonly Prefix?: string | undefined;
  readonly Tags?: readonly SimS3LifecycleTag[] | undefined;
  readonly ObjectSizeGreaterThan?: number | undefined;
  readonly ObjectSizeLessThan?: number | undefined;
}

/**
 * Minimal structural sim S3 Object tag, as a lifecycle filter names one.
 */
export interface SimS3LifecycleTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim S3 lifecycle expiry.
 */
export interface SimS3LifecycleExpiration {
  readonly Date?: Date | undefined;
  readonly Days?: number | undefined;
  readonly ExpiredObjectDeleteMarker?: boolean | undefined;
}

/**
 * Minimal structural sim S3 lifecycle storage class transition.
 */
export interface SimS3LifecycleTransition {
  readonly Date?: Date | undefined;
  readonly Days?: number | undefined;
  readonly StorageClass?: string | undefined;
}

/**
 * Minimal structural sim S3 lifecycle abandoned upload rule.
 */
export interface SimS3LifecycleAbortIncompleteMultipartUpload {
  readonly DaysAfterInitiation?: number | undefined;
}

/**
 * Minimal structural sim S3 lifecycle noncurrent version expiry.
 */
export interface SimS3LifecycleNoncurrentVersionExpiration {
  readonly NoncurrentDays?: number | undefined;
  readonly NewerNoncurrentVersions?: number | undefined;
}

/**
 * Minimal structural sim S3 lifecycle noncurrent version transition.
 */
export interface SimS3LifecycleNoncurrentVersionTransition {
  readonly NoncurrentDays?: number | undefined;
  readonly StorageClass?: string | undefined;
  readonly NewerNoncurrentVersions?: number | undefined;
}

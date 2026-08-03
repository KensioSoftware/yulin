/**
 * Build the error a property of an AWS::S3::Bucket Resource is refused with.
 *
 * The wording matters. Sim CloudFormation downgrades a failure whose message
 * reads as an unsupported Resource type into a skip, and a skipped Bucket
 * property is the dangerous case here: the Bucket is still created, so the
 * Stack looks right and behaves differently. So every refusal says `Invalid`,
 * and none of them says `Unsupported sim`.
 */
export function s3BucketResourceError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(`Invalid AWS::S3::Bucket Resource ${logicalId}: ${reason}`);
}

/**
 * Build the error the NotificationConfiguration of an AWS::S3::Bucket Resource
 * is refused with.
 *
 * The property is named separately from the Resource because the shape it is
 * read through is deep, and a reader that says only which Resource failed
 * leaves the Stack owner hunting for the level that was wrong.
 */
export function s3BucketNotificationError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid AWS::S3::Bucket NotificationConfiguration in Resource ${logicalId}: ${reason}`,
  );
}

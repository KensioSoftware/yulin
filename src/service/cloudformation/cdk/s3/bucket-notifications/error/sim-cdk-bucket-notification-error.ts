/**
 * Build the error a Custom::S3BucketNotifications Resource is refused with.
 *
 * The wording matters. Sim CloudFormation downgrades a failure whose message
 * reads as an unsupported Resource type into a skip, and a skipped notification
 * Resource is exactly the silence this feature exists to remove: the Stack
 * would deploy with the Bucket and the function and nothing between them. So
 * every refusal here says `Invalid`, and none of them says `Unsupported sim`.
 */
export function bucketNotificationsError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid Custom::S3BucketNotifications Resource ${logicalId}: ${reason}`,
  );
}

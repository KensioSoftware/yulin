/**
 * The event types real S3 has that this simulator does not raise.
 *
 * Listed so an unsimulated event type is refused as unsimulated rather than as
 * a typo, which are different problems with different fixes. Everything here
 * either describes an S3 feature the simulator has no model of, such as
 * versioning, replication or lifecycle rules, or a way of creating an Object
 * that it has no command for.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html
 */
export const SIM_S3_UNSIMULATED_NOTIFICATION_EVENTS: ReadonlySet<string> =
  new Set([
    "s3:IntelligentTiering",
    "s3:LifecycleExpiration:*",
    "s3:LifecycleExpiration:Delete",
    "s3:LifecycleExpiration:DeleteMarkerCreated",
    "s3:LifecycleTransition",
    "s3:ObjectAcl:Put",
    "s3:ObjectCreated:Post",
    "s3:ObjectRemoved:DeleteMarkerCreated",
    "s3:ObjectRestore:*",
    "s3:ObjectRestore:Completed",
    "s3:ObjectRestore:Delete",
    "s3:ObjectRestore:Post",
    "s3:ObjectTagging:*",
    "s3:ObjectTagging:Delete",
    "s3:ObjectTagging:Put",
    "s3:ReducedRedundancyLostObject",
    "s3:Replication:*",
    "s3:Replication:OperationFailedReplication",
    "s3:Replication:OperationMissedThreshold",
    "s3:Replication:OperationNotTracked",
    "s3:Replication:OperationReplicatedAfterThreshold",
  ]);

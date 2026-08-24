/**
 * The AWS::S3::Bucket properties this simulation acts on.
 */
export const simulatedPropertyNames: ReadonlySet<string> = new Set([
  "BucketName",
  "NotificationConfiguration",
  "PublicAccessBlockConfiguration",
  "WebsiteConfiguration",
]);

/**
 * Real AWS::S3::Bucket properties this simulation reads and does nothing with.
 *
 * Nothing this simulator models can tell the difference. There is no simulated
 * KMS and Object bytes are stored as they arrive, so an encrypted Bucket and an
 * unencrypted one answer every simulated command identically, and no simulated
 * service reads a Bucket tag. So these are not recorded as ignored either: a
 * report of differences that make no difference is one nobody can read.
 */
export const inertPropertyNames: ReadonlySet<string> = new Set([
  "BucketEncryption",
  "Tags",
]);

/**
 * Real AWS::S3::Bucket properties this simulation does not model, with what
 * each of them would have changed.
 *
 * The Bucket is created without them and each one is recorded against the
 * Resource. A versioned Bucket, for instance, answers a delete with a delete
 * marker and an `ObjectRemoved:DeleteMarkerCreated` event, where this simulator
 * removes the Object and raises `ObjectRemoved:Delete`, so a test written
 * against versioning needs to find out that it was never configured.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  ["AbacStatus", "attribute-based access control is not simulated"],
  ["AccelerateConfiguration", "transfer acceleration is not simulated"],
  [
    "AccessControl",
    "canned Bucket ACLs are not simulated, and simulated S3 authorizes " +
      "through IAM and the Bucket policy instead",
  ],
  ["AnalyticsConfigurations", "storage class analytics is not simulated"],
  ["BucketNamePrefix", "generated Bucket names are not simulated"],
  ["BucketNamespace", "Bucket namespaces are not simulated"],
  [
    "CorsConfiguration",
    "simulated S3 does not answer preflight requests or return CORS headers",
  ],
  [
    "IntelligentTieringConfigurations",
    "storage classes are not simulated, so nothing transitions between them",
  ],
  ["InventoryConfigurations", "Bucket inventory reports are not simulated"],
  [
    "LifecycleConfiguration",
    "the rules are stored and GetBucketLifecycleConfiguration hands them " +
      "back, and simulated S3 expires or transitions no Object against them",
  ],
  ["LoggingConfiguration", "server access logging is not simulated"],
  ["MetadataConfiguration", "Bucket metadata tables are not simulated"],
  ["MetadataTableConfiguration", "Bucket metadata tables are not simulated"],
  ["MetricsConfigurations", "CloudWatch request metrics are not simulated"],
  [
    "ObjectLockConfiguration",
    "Object Lock is not simulated, so a retained Object can still be deleted",
  ],
  [
    "ObjectLockEnabled",
    "Object Lock is not simulated, so a retained Object can still be deleted",
  ],
  ["OwnershipControls", "Object ownership and ACLs are not simulated"],
  ["ReplicationConfiguration", "Bucket replication is not simulated"],
  [
    "VersioningConfiguration",
    "Object versions are not simulated, so a delete removes the Object and " +
      "raises ObjectRemoved:Delete rather than creating a delete marker",
  ],
]);

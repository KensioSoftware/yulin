/**
 * The AWS::S3::Bucket properties this simulation acts on.
 */
export const simulatedPropertyNames: ReadonlySet<string> = new Set([
  "BucketEncryption",
  "BucketName",
  "LifecycleConfiguration",
  "ObjectLockConfiguration",
  "ObjectLockEnabled",
  "NotificationConfiguration",
  "PublicAccessBlockConfiguration",
  "VersioningConfiguration",
  "WebsiteConfiguration",
]);

/**
 * Real AWS::S3::Bucket properties this simulation reads and does nothing with.
 *
 * Nothing this simulator models can tell the difference. No simulated service
 * reads a Bucket tag, so this is not recorded as ignored either: a report of
 * differences that make no difference is one nobody can read.
 */
export const inertPropertyNames: ReadonlySet<string> = new Set(["Tags"]);

import type {
  SimCfnSkippedPropertyRule,
  SimCfnSkippedPropertyRules,
} from "../../../cloudformation/resource/ignore/sim-cfn-skipped-property.type.js";
import { validateSimCfnS3BucketReplication } from "./replication/sim-cfn-s3-bucket-replication-rules.js";

/**
 * Real AWS::S3::Bucket properties this simulation does not model, with what
 * each of them would have changed.
 *
 * The Bucket is created without them and each one is recorded against the
 * Resource. A Bucket declaring replication, for instance, copies nothing to
 * the Bucket it names, so a test expecting an Object to arrive there needs to
 * find out that nothing was ever going to send it.
 *
 * A property whose value real S3 answers with a 400 states what it has to
 * satisfy here as well. Nothing acts on the value either way, and reading it
 * this far is what keeps a template AWS refuses from deploying.
 */
export const unsimulatedPropertyReasons: SimCfnSkippedPropertyRules = new Map<
  string,
  SimCfnSkippedPropertyRule | string
>([
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
    "Objects are not moved between storage classes by access pattern, and " +
      "only a lifecycle rule transitions one",
  ],
  ["InventoryConfigurations", "Bucket inventory reports are not simulated"],
  ["LoggingConfiguration", "server access logging is not simulated"],
  ["MetadataConfiguration", "Bucket metadata tables are not simulated"],
  ["MetadataTableConfiguration", "Bucket metadata tables are not simulated"],
  ["MetricsConfigurations", "CloudWatch request metrics are not simulated"],
  ["OwnershipControls", "Object ownership and ACLs are not simulated"],
  [
    "ReplicationConfiguration",
    {
      reason: "Bucket replication is not simulated",
      constraint: validateSimCfnS3BucketReplication,
    },
  ],
]);

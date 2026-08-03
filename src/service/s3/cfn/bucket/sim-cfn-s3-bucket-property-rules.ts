import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { s3BucketResourceError } from "./error/sim-cfn-s3-bucket-error.js";

/**
 * The AWS::S3::Bucket properties this simulation acts on.
 */
const simulatedPropertyNames: ReadonlySet<string> = new Set([
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
 * service reads a Bucket tag. Both are on almost every Bucket CDK synthesizes,
 * so refusing them would leave a CDK app unable to deploy over a difference no
 * test could observe.
 */
const inertPropertyNames: ReadonlySet<string> = new Set([
  "BucketEncryption",
  "Tags",
]);

/**
 * Real AWS::S3::Bucket properties this simulation does not model.
 *
 * Each of these changes what a simulated command answers on real AWS. A
 * versioned Bucket answers a delete with a delete marker and an
 * `ObjectRemoved:DeleteMarkerCreated` event, where this simulator removes the
 * Object and raises `ObjectRemoved:Delete`. So they fail the Resource rather
 * than being dropped on the way through, which would leave a Bucket that looks
 * configured to the template and behaves as though it were not.
 */
const unsimulatedPropertyNames: ReadonlySet<string> = new Set([
  "AbacStatus",
  "AccelerateConfiguration",
  "AccessControl",
  "AnalyticsConfigurations",
  "BucketNamePrefix",
  "BucketNamespace",
  "CorsConfiguration",
  "IntelligentTieringConfigurations",
  "InventoryConfigurations",
  "LifecycleConfiguration",
  "LoggingConfiguration",
  "MetadataConfiguration",
  "MetadataTableConfiguration",
  "MetricsConfigurations",
  "ObjectLockConfiguration",
  "ObjectLockEnabled",
  "OwnershipControls",
  "ReplicationConfiguration",
  "VersioningConfiguration",
]);

interface SimCfnS3BucketPropertyRulesProperties {
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Which AWS::S3::Bucket properties simulated S3 can act on.
 *
 * Anything else fails the Resource. Being stricter than CloudFormation shows up
 * as a puzzling deployment failure here; being looser shows up as a Bucket
 * behaving one way in a test and another way on AWS.
 */
export class SimCfnS3BucketPropertyRules {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnS3BucketPropertyRulesProperties) {
    this.logicalId = properties.logicalId;
    this.properties = properties.properties;
  }

  /**
   * Refuse everything about this Resource that is not simulated.
   */
  assertSimulated(): void {
    this.refuseUnusableBucketName();

    for (const name of Object.keys(this.properties)) {
      this.assertSimulatedProperty(name);
    }
  }

  /**
   * Refuse a BucketName that is not a name.
   *
   * A Resource stating none is named after its logical id. One stating
   * something that is not a string is a template error, and falling back to
   * the logical id would deploy a Bucket under a name nothing else in the
   * template refers to.
   */
  private refuseUnusableBucketName(): void {
    const bucketName = this.properties["BucketName"];

    if (bucketName === undefined || typeof bucketName === "string") {
      return;
    }

    throw s3BucketResourceError(
      this.logicalId,
      "BucketName must be a Bucket name string",
    );
  }

  private assertSimulatedProperty(name: string): void {
    if (simulatedPropertyNames.has(name) || inertPropertyNames.has(name)) {
      return;
    }

    if (unsimulatedPropertyNames.has(name)) {
      throw s3BucketResourceError(
        this.logicalId,
        `${name} is a real AWS::S3::Bucket property that simulated S3 does ` +
          `not simulate, so it is refused rather than ignored`,
      );
    }

    throw s3BucketResourceError(
      this.logicalId,
      `${name} is not an AWS::S3::Bucket property`,
    );
  }
}

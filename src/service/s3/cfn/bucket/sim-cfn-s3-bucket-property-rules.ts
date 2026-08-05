import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import { s3BucketResourceError } from "./error/sim-cfn-s3-bucket-error.js";
import {
  inertPropertyNames,
  simulatedPropertyNames,
  unsimulatedPropertyReasons,
} from "./sim-cfn-s3-bucket-property-names.js";

interface SimCfnS3BucketPropertyRulesProperties {
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What simulated S3 does with each AWS::S3::Bucket property it is handed.
 *
 * Simulated CloudFormation deploys what it can, so a property this simulation
 * cannot act on does not stop the Bucket being created. It is left out and
 * recorded against the Resource, where a test can find it. Refusing is kept for
 * the one case where there is nothing coherent to create: a BucketName that is
 * not a name.
 *
 * A property this simulation has never heard of is treated the same way. It may
 * be a typo, or a property AWS added since this list was written, and a Bucket
 * that deploys with the unknown name recorded is more useful than a stack that
 * fails over either.
 */
export class SimCfnS3BucketPropertyRules {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnS3BucketPropertyRulesProperties) {
    this.logicalId = properties.logicalId;
    this.properties = properties.properties;
    this.ignorer = properties.ignorer;
  }

  /**
   * Record everything about this Resource that is not simulated, refusing only
   * what leaves nothing to create.
   */
  apply(): void {
    this.refuseUnusableBucketName();

    for (const name of Object.keys(this.properties)) {
      this.applyToProperty(name);
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

  private applyToProperty(name: string): void {
    if (simulatedPropertyNames.has(name) || inertPropertyNames.has(name)) {
      return;
    }

    const unsimulatedReason = unsimulatedPropertyReasons.get(name);

    if (unsimulatedReason !== undefined) {
      this.ignorer.ignoreProperty(
        name,
        `${name} is a real AWS::S3::Bucket property simulated S3 does not ` +
          `act on: ${unsimulatedReason}`,
      );

      return;
    }

    this.ignorer.ignoreProperty(
      name,
      `${name} is not a property simulated S3 knows about, so the Bucket is ` +
        `created without it`,
    );
  }
}

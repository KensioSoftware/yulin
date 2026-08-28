import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3 } from "../../sim-s3.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { validateS3BucketName } from "../../bucket/validate/validate-s3-bucket-name.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimCfnS3BucketConfigurator } from "./sim-cfn-s3-bucket-configurator.js";
import { SimCfnS3BucketPropertyRules } from "./sim-cfn-s3-bucket-property-rules.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnS3BucketCreatorProperties {
  readonly simS3: SimS3;
}

/**
 * Creates simulated S3 Buckets from AWS::S3::Bucket CloudFormation Resources.
 */
export class SimCfnS3BucketCreator {
  private readonly simS3: SimS3;

  constructor(properties: SimCfnS3BucketCreatorProperties) {
    this.simS3 = properties.simS3;
  }

  /**
   * Create a simulated Bucket, with the configurations it declares.
   *
   * Which properties the Resource carries is settled before anything is
   * created. A property this simulation does not model is recorded against the
   * Resource and the Bucket is created without it. What each of the remaining
   * ones says is then checked as it is applied.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimS3Bucket> {
    new SimCfnS3BucketPropertyRules({
      logicalId: resource.logicalId,
      properties,
      ignorer: resource,
    }).apply();

    const bucketName = this.bucketNameForResource(resource, properties);
    validateS3BucketName(bucketName);

    await this.simS3.createBucket({ input: { Bucket: bucketName } }, options);

    const bucket = this.simS3.getSimBucketByName(bucketName);
    assertDefined(
      bucket,
      `sim S3 Bucket ${bucketName} after CloudFormation creation`,
    );

    await new SimCfnS3BucketConfigurator({
      simS3: this.simS3,
      resource,
      properties,
      bucketName,
      options,
    }).configure();

    return bucket;
  }

  /**
   * A Resource without a BucketName is named after its logical id, rather than
   * the generated name real CloudFormation invents.
   */
  private bucketNameForResource(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const bucketName = properties["BucketName"];

    if (typeof bucketName === "string") {
      return bucketName;
    }

    return resource.logicalId.toLowerCase();
  }
}

import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3PublicAccessBlockConfiguration } from "../../../bucket/public-access/sim-s3-public-access-block.js";

/**
 * Reads the `PublicAccessBlockConfiguration` property of an AWS::S3::Bucket
 * Resource, which a template uses to open a Bucket up from the all-blocked
 * state a new Bucket starts in.
 *
 * CloudFormation names the settings exactly as PutPublicAccessBlock does, so
 * the property is handed to the command rather than translated here.
 */
export class SimCfnS3BucketPublicAccessConfiguration {
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnTemplateValueRecord) {
    this.properties = properties;
  }

  /**
   * The settings to apply, or nothing when the Resource declares none.
   */
  read(): SimS3PublicAccessBlockConfiguration | undefined {
    const publicAccessConfig =
      this.properties["PublicAccessBlockConfiguration"];

    if (
      publicAccessConfig === undefined ||
      publicAccessConfig === null ||
      typeof publicAccessConfig !== "object" ||
      Array.isArray(publicAccessConfig)
    ) {
      return undefined;
    }

    return publicAccessConfig;
  }
}

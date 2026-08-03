import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type { SimS3PublicAccessBlockConfiguration } from "../../../bucket/public-access/sim-s3-public-access-block.js";
import { s3BucketResourceError } from "../error/sim-cfn-s3-bucket-error.js";

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
  private readonly shape: SimCfnValueShape;

  constructor(logicalId: string, properties: SimCfnTemplateValueRecord) {
    this.properties = properties;
    this.shape = new SimCfnValueShape((reason) =>
      s3BucketResourceError(logicalId, reason),
    );
  }

  /**
   * The settings to apply, or nothing when the Resource declares none.
   *
   * Settings that are there but are not the shape they should be fail the
   * Resource. Read as nothing, the Bucket would stay fully blocked and refuse
   * the public policy the template went on to attach.
   */
  read(): SimS3PublicAccessBlockConfiguration | undefined {
    const declared = this.properties["PublicAccessBlockConfiguration"];

    if (declared === undefined) {
      return undefined;
    }

    return this.shape.record(declared, "PublicAccessBlockConfiguration");
  }
}

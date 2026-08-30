import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type { SimS3VersioningConfiguration } from "../../../bucket/versioning/sim-s3-bucket-versioning.js";
import { s3BucketResourceError } from "../error/sim-cfn-s3-bucket-error.js";

/**
 * Reads the `VersioningConfiguration` property of an AWS::S3::Bucket Resource.
 *
 * CloudFormation names the status exactly as PutBucketVersioning does, so the
 * property is handed to the command rather than translated here. The command
 * is also what refuses a status S3 does not take, which keeps a template and
 * an SDK caller answering alike.
 */
export class SimCfnS3BucketVersioningConfiguration {
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly shape: SimCfnValueShape;

  constructor(logicalId: string, properties: SimCfnTemplateValueRecord) {
    this.properties = properties;
    this.shape = new SimCfnValueShape((reason) =>
      s3BucketResourceError(logicalId, reason),
    );
  }

  /**
   * The configuration to apply, or nothing when the Resource declares none.
   */
  read(): SimS3VersioningConfiguration | undefined {
    const declared = this.properties["VersioningConfiguration"];

    if (declared === undefined) {
      return undefined;
    }

    return this.shape.record(declared, "VersioningConfiguration");
  }
}

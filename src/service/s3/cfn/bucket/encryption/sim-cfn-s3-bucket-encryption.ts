import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type {
  SimS3ServerSideEncryptionConfiguration,
  SimS3ServerSideEncryptionRule,
} from "../../../bucket/encryption/sim-s3-bucket-encryption.js";
import { s3BucketResourceError } from "../error/sim-cfn-s3-bucket-error.js";

/**
 * Reads the `BucketEncryption` property of an AWS::S3::Bucket Resource into a
 * PutBucketEncryption request.
 *
 * CloudFormation and the API disagree about one name. A template states
 * `ServerSideEncryptionByDefault` inside each rule where the request states
 * `ApplyServerSideEncryptionByDefault`, so that one is translated here and
 * everything else is handed on as it was declared.
 */
export class SimCfnS3BucketEncryption {
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
  read(): SimS3ServerSideEncryptionConfiguration | undefined {
    const declared = this.properties["BucketEncryption"];

    if (declared === undefined) {
      return undefined;
    }

    const encryption = this.shape.record(declared, "BucketEncryption");
    const rules = this.shape.list(
      encryption["ServerSideEncryptionConfiguration"] ?? [],
      "BucketEncryption ServerSideEncryptionConfiguration",
    );

    return { Rules: rules.map((rule, index) => this.readRule(rule, index)) };
  }

  private readRule(
    value: SimCfnTemplateValue,
    index: number,
  ): SimS3ServerSideEncryptionRule {
    const named = `BucketEncryption rule ${index}`;
    const rule = this.shape.record(value, named);
    const byDefault = rule["ServerSideEncryptionByDefault"];

    return {
      ...(byDefault !== undefined && {
        ApplyServerSideEncryptionByDefault: this.shape.record(
          byDefault,
          `${named} ServerSideEncryptionByDefault`,
        ),
      }),
      ...(rule["BucketKeyEnabled"] !== undefined && {
        BucketKeyEnabled: rule["BucketKeyEnabled"] === true,
      }),
    };
  }
}

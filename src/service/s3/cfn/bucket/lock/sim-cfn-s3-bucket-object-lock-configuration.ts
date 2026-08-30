import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type { SimS3ObjectLockConfigurationInput } from "../../../bucket/lock/sim-s3-object-lock-configuration.js";
import { simS3ObjectLockEnabled } from "../../../bucket/lock/sim-s3-object-lock-configuration.js";
import { s3BucketResourceError } from "../error/sim-cfn-s3-bucket-error.js";

/**
 * The AWS::S3::Bucket values that turn Object Lock on. CloudFormation carries
 * a boolean property as either, depending on where the value came from.
 */
const objectLockEnabledValues: ReadonlySet<unknown> = new Set([true, "true"]);
const objectLockDisabledValues: ReadonlySet<unknown> = new Set([
  false,
  "false",
]);

/**
 * Reads the Object Lock properties of an AWS::S3::Bucket Resource.
 *
 * A Bucket declares Object Lock across two properties. `ObjectLockEnabled`
 * turns it on and `ObjectLockConfiguration` carries the default retention,
 * and real CloudFormation requires the first before it will read the second.
 * CDK's `objectLockEnabled` and `objectLockDefaultRetention` synthesise both.
 *
 * The configuration is handed to PutObjectLockConfiguration rather than
 * translated here, so a template and an SDK caller are validated identically,
 * including the versioning a locked Bucket has to have underneath it.
 */
export class SimCfnS3BucketObjectLockConfiguration {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly shape: SimCfnValueShape;

  constructor(logicalId: string, properties: SimCfnTemplateValueRecord) {
    this.logicalId = logicalId;
    this.properties = properties;
    this.shape = new SimCfnValueShape((reason) =>
      s3BucketResourceError(logicalId, reason),
    );
  }

  /**
   * The configuration to apply, or nothing where the Resource declares none.
   *
   * A Bucket declaring `ObjectLockEnabled` and no configuration is locked with
   * no default retention, which is a real thing to declare: every version it
   * holds is then retained only by the requests that name one.
   */
  read(): SimS3ObjectLockConfigurationInput | undefined {
    if (!this.isEnabled()) {
      return undefined;
    }

    const declared = this.properties["ObjectLockConfiguration"];

    if (declared === undefined) {
      return { ObjectLockEnabled: simS3ObjectLockEnabled };
    }

    return {
      ...this.shape.record(declared, "ObjectLockConfiguration"),
      ObjectLockEnabled: simS3ObjectLockEnabled,
    };
  }

  /**
   * Whether the Resource asks for Object Lock.
   *
   * Real CloudFormation refuses an `ObjectLockConfiguration` on a Bucket that
   * does not also declare `ObjectLockEnabled`, and so does this: a Bucket
   * created around the property would report a default retention it was not
   * applying to anything.
   */
  private isEnabled(): boolean {
    const enabled = this.properties["ObjectLockEnabled"];

    if (objectLockEnabledValues.has(enabled)) {
      return true;
    }

    if (
      this.properties["ObjectLockConfiguration"] !== undefined &&
      (enabled === undefined || objectLockDisabledValues.has(enabled))
    ) {
      throw s3BucketResourceError(
        this.logicalId,
        "ObjectLockConfiguration requires ObjectLockEnabled to be true, " +
          "because Object Lock holds a version and a Bucket without it holds " +
          "none",
      );
    }

    if (enabled !== undefined && !objectLockDisabledValues.has(enabled)) {
      throw s3BucketResourceError(
        this.logicalId,
        "ObjectLockEnabled must be true or false",
      );
    }

    return false;
  }
}

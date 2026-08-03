import { isRecord } from "../../../../../../util/type-guard/record.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../template/value/sim-cfn-template-value.js";
import { bucketNotificationsError } from "../error/sim-cdk-bucket-notification-error.js";

/**
 * The shape checks a Custom::S3BucketNotifications Resource's properties are
 * read through.
 *
 * A template is JSON, so a property can be anything, while the request it
 * becomes has a shape. These are the four questions that gets asked, each
 * naming what was wrong in the wording that fails the Stack rather than
 * skipping the Resource.
 */
export class SimCdkBucketNotificationShape {
  private readonly logicalId: string;

  constructor(logicalId: string) {
    this.logicalId = logicalId;
  }

  /**
   * Read a property the template need not carry, leaving it out when it does
   * not.
   */
  present<T>(
    value: SimCfnTemplateValue | undefined,
    read: (value: SimCfnTemplateValue) => T,
  ): T | undefined {
    if (value === undefined) {
      return undefined;
    }

    return read(value);
  }

  /**
   * A value that has to be an object.
   */
  record(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): SimCfnTemplateValueRecord {
    if (!isTemplateRecord(value)) {
      throw bucketNotificationsError(
        this.logicalId,
        `${name} must be an object`,
      );
    }

    return value;
  }

  /**
   * A value that has to be a list.
   */
  list(value: SimCfnTemplateValue, name: string): SimCfnTemplateValue[] {
    if (!Array.isArray(value)) {
      throw bucketNotificationsError(this.logicalId, `${name} must be a list`);
    }

    return value;
  }

  /**
   * A value that has to be a string.
   */
  string(value: SimCfnTemplateValue, name: string): string {
    if (typeof value !== "string") {
      throw bucketNotificationsError(
        this.logicalId,
        `${name} must be a string`,
      );
    }

    return value;
  }
}

/**
 * Whether a template value is an object rather than a list or a primitive.
 */
function isTemplateRecord(
  value: SimCfnTemplateValue | undefined,
): value is SimCfnTemplateValueRecord {
  return isRecord(value);
}

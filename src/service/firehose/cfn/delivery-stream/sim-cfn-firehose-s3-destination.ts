import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimFirehoseBufferingHintsInput } from "../../destination/sim-firehose-buffering-hints.js";
import type { SimFirehoseS3DestinationInput } from "../../destination/sim-firehose-s3-destination.js";
import { simCfnFirehoseResourceError } from "../sim-cfn-firehose-resource-error.js";
import { firehoseDeliveryStreamResourceType } from "../sim-cfn-firehose-resource-types.js";
import { unsimulatedDestinationPropertyReasons } from "./sim-cfn-firehose-delivery-stream-property-names.js";

interface SimCfnFirehoseS3DestinationProperties {
  readonly resource: SimCfnResource;
  readonly propertyName: string;
  readonly value: SimCfnTemplateValue;
}

/**
 * Reads an S3 destination configuration out of a template.
 *
 * What the destination may say is decided by simulated Firehose, so a Bucket
 * ARN naming an Object or buffering hints outside the range Firehose allows are
 * refused by the command that reads them. What this reads is the shape: a field
 * that has to be a string or a number is checked for being one, since a
 * template that put an object where a Bucket ARN goes has made a mistake
 * CreateDeliveryStream cannot explain.
 *
 * The extended and the plain configuration arrive in the same shape. Every
 * field read here is on both, and CDK synthesizes the extended one.
 */
export class SimCfnFirehoseS3Destination {
  private readonly resource: SimCfnResource;
  private readonly propertyName: string;
  private readonly fields: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnFirehoseS3DestinationProperties) {
    this.resource = properties.resource;
    this.propertyName = properties.propertyName;

    if (!isRecord(properties.value)) {
      throw this.propertyError(`${properties.propertyName} must be an object`);
    }

    this.fields = new Map(Object.entries(properties.value));

    this.recordUnsimulated();
  }

  /**
   * The destination as CreateDeliveryStream takes it.
   */
  input(): SimFirehoseS3DestinationInput {
    const bucketArn = this.optionalString("BucketARN");
    const roleArn = this.optionalString("RoleARN");
    const prefix = this.optionalString("Prefix");
    const errorOutputPrefix = this.optionalString("ErrorOutputPrefix");
    const bufferingHints = this.bufferingHints();

    return {
      ...(bucketArn !== undefined && { BucketARN: bucketArn }),
      ...(roleArn !== undefined && { RoleARN: roleArn }),
      ...(prefix !== undefined && { Prefix: prefix }),
      ...(errorOutputPrefix !== undefined && {
        ErrorOutputPrefix: errorOutputPrefix,
      }),
      ...(bufferingHints !== undefined && { BufferingHints: bufferingHints }),
    };
  }

  /**
   * When the buffer is delivered, as the template declares it.
   */
  private bufferingHints(): SimFirehoseBufferingHintsInput | undefined {
    const hints = this.fields.get("BufferingHints");

    if (hints === undefined) {
      return undefined;
    }

    if (!isRecord(hints)) {
      throw this.propertyError(
        `${this.propertyName}.BufferingHints must be an object`,
      );
    }

    const size = hints["SizeInMBs"];
    const interval = hints["IntervalInSeconds"];

    return {
      ...(size !== undefined && {
        SizeInMBs: this.hintNumber(size, "SizeInMBs"),
      }),
      ...(interval !== undefined && {
        IntervalInSeconds: this.hintNumber(interval, "IntervalInSeconds"),
      }),
    };
  }

  private hintNumber(value: unknown, field: string): number {
    if (typeof value !== "number") {
      throw this.propertyError(
        `${this.propertyName}.BufferingHints.${field} must be a number`,
      );
    }

    return value;
  }

  /**
   * A field that has to be a string, when the template carries one.
   */
  private optionalString(field: string): string | undefined {
    const value = this.fields.get(field);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.propertyError(
        `${this.propertyName}.${field} must be a string`,
      );
    }

    return value;
  }

  /**
   * Record the destination fields this simulation gives no behaviour to.
   */
  private recordUnsimulated(): void {
    for (const [field, reason] of unsimulatedDestinationPropertyReasons) {
      if (this.fields.has(field)) {
        this.resource.ignoreProperty(`${this.propertyName}.${field}`, reason);
      }
    }
  }

  private propertyError(reason: string): Error {
    return simCfnFirehoseResourceError(
      firehoseDeliveryStreamResourceType,
      this.resource.logicalId,
      reason,
    );
  }
}

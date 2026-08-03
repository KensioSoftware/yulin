import type { SimS3NotificationEvent } from "../../bucket/notification/sim-s3-notification-event.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";

interface SimS3ObjectEventProperties {
  readonly eventName: SimS3NotificationEvent;
  readonly eventTime: Date;
  readonly bucketName: string;
  readonly bucketArn: string;
  readonly regionName: AwsRegionName;
  readonly ownerAccountId: string;
  readonly principalId: string;
  readonly key: string;
  readonly sequencer: string;
  readonly size?: number | undefined;
  readonly eTag?: string | undefined;
}

/**
 * Something that happened to an Object, in terms no destination owns.
 *
 * The `Records` document an S3 event notification is delivered as is one
 * serialisation of this rather than the thing itself, because a destination
 * decides its own shape: an SNS topic wraps it, and EventBridge uses a
 * different schema entirely.
 *
 * `size` and `eTag` describe an Object that exists, so a removal carries
 * neither, as a real S3 removal record does not.
 */
export class SimS3ObjectEvent {
  public readonly eventName: SimS3NotificationEvent;
  public readonly eventTime: Date;
  public readonly bucketName: string;
  public readonly bucketArn: string;
  public readonly regionName: AwsRegionName;
  public readonly ownerAccountId: string;
  public readonly principalId: string;
  public readonly key: string;
  public readonly sequencer: string;
  public readonly size: number | undefined;
  public readonly eTag: string | undefined;

  constructor(properties: SimS3ObjectEventProperties) {
    this.eventName = properties.eventName;
    this.eventTime = properties.eventTime;
    this.bucketName = properties.bucketName;
    this.bucketArn = properties.bucketArn;
    this.regionName = properties.regionName;
    this.ownerAccountId = properties.ownerAccountId;
    this.principalId = properties.principalId;
    this.key = properties.key;
    this.sequencer = properties.sequencer;
    this.size = properties.size;
    this.eTag = properties.eTag;
  }
}

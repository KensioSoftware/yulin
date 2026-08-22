import { SimFirehoseBuffer } from "../delivery/sim-firehose-buffer.js";
import type { SimFirehoseS3Destination } from "../destination/sim-firehose-s3-destination.js";

/**
 * The states a delivery stream reports.
 *
 * A simulated delivery stream is ACTIVE from the moment CreateDeliveryStream
 * answers. Real Firehose spends a minute or so in CREATING, and a test that had
 * to wait it out would be waiting on nothing.
 */
export type SimFirehoseDeliveryStreamStatus = "ACTIVE";

/**
 * How a delivery stream gets its records.
 *
 * `DirectPut` is the only source simulated. A delivery stream reading from a
 * Kinesis stream is a separate job.
 */
export type SimFirehoseDeliveryStreamType = "DirectPut";

interface SimFirehoseDeliveryStreamProperties {
  readonly name: string;
  readonly arn: string;
  readonly destination: SimFirehoseS3Destination;
  readonly createdAt: Date;
}

/**
 * One delivery stream, and what it has taken but not yet delivered.
 *
 * A delivery stream is a destination and a buffer. Records arrive through
 * PutRecord, wait in the buffer until it passes one of its two bounds, and
 * leave as one S3 Object.
 *
 * The version is the `1` in a delivered Object's key. Real Firehose moves it on
 * with every configuration change, and nothing here changes a delivery stream's
 * configuration, so it stays at 1 for the life of the delivery stream.
 */
export class SimFirehoseDeliveryStream {
  public readonly name: string;
  public readonly arn: string;
  public readonly destination: SimFirehoseS3Destination;
  public readonly createdAt: Date;
  public readonly buffer = new SimFirehoseBuffer();
  public readonly versionId = "1";
  public readonly status: SimFirehoseDeliveryStreamStatus = "ACTIVE";
  public readonly deliveryStreamType: SimFirehoseDeliveryStreamType =
    "DirectPut";

  constructor(properties: SimFirehoseDeliveryStreamProperties) {
    this.name = properties.name;
    this.arn = properties.arn;
    this.destination = properties.destination;
    this.createdAt = properties.createdAt;
  }

  /**
   * Whether the buffer has reached the size that delivers it.
   */
  get isBufferFull(): boolean {
    return (
      this.buffer.byteLength >= this.destination.bufferingHints.sizeInBytes
    );
  }
}

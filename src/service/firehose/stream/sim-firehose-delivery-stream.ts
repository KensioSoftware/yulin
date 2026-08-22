import { SimFirehoseBuffer } from "../delivery/sim-firehose-buffer.js";
import type { SimFirehoseS3Destination } from "../destination/sim-firehose-s3-destination.js";
import type {
  SimFirehoseDeliveryStreamType,
  SimFirehoseSource,
} from "../source/sim-firehose-source.js";

/**
 * The states a delivery stream reports.
 *
 * A simulated delivery stream is ACTIVE from the moment CreateDeliveryStream
 * answers. Real Firehose spends a minute or so in CREATING, and a test that had
 * to wait it out would be waiting on nothing.
 */
export type SimFirehoseDeliveryStreamStatus = "ACTIVE";

interface SimFirehoseDeliveryStreamProperties {
  readonly name: string;
  readonly arn: string;
  readonly destination: SimFirehoseS3Destination;
  readonly source: SimFirehoseSource;
  readonly createdAt: Date;
}

/**
 * One delivery stream, and what it has taken but not yet delivered.
 *
 * A delivery stream is a source, a destination and a buffer. Records arrive
 * from where the source says they do, wait in the buffer until it passes one of
 * its two bounds, and leave as one S3 Object.
 *
 * The version is the `1` in a delivered Object's key. Real Firehose moves it on
 * with every configuration change, and nothing here changes a delivery stream's
 * configuration, so it stays at 1 for the life of the delivery stream.
 */
export class SimFirehoseDeliveryStream {
  public readonly name: string;
  public readonly arn: string;
  public readonly destination: SimFirehoseS3Destination;
  public readonly source: SimFirehoseSource;
  public readonly createdAt: Date;
  public readonly buffer = new SimFirehoseBuffer();
  public readonly versionId = "1";
  public readonly status: SimFirehoseDeliveryStreamStatus = "ACTIVE";

  constructor(properties: SimFirehoseDeliveryStreamProperties) {
    this.name = properties.name;
    this.arn = properties.arn;
    this.destination = properties.destination;
    this.source = properties.source;
    this.createdAt = properties.createdAt;
  }

  /**
   * Where this delivery stream gets its records, as it reports it.
   */
  get deliveryStreamType(): SimFirehoseDeliveryStreamType {
    return this.source.deliveryStreamType;
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

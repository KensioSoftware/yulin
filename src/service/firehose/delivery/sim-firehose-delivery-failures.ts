import { SimFirehoseFailure } from "../failure/sim-firehose-failure.js";
import type { SimFirehoseFailures } from "../failure/sim-firehose-failures.js";

interface SimFirehoseDeliveryFailureProperties {
  readonly deliveryStreamName: string;
  readonly bucketName: string;
  readonly objectKey: string;
  readonly recordCount: number;
  readonly roleArn: string;
  readonly error: unknown;
}

/**
 * One buffer a delivery stream could not write.
 */
export class SimFirehoseDeliveryFailure extends SimFirehoseFailure {
  public readonly bucketName: string;
  public readonly objectKey: string;
  public readonly recordCount: number;

  constructor(properties: SimFirehoseDeliveryFailureProperties) {
    super(properties);
    this.bucketName = properties.bucketName;
    this.objectKey = properties.objectKey;
    this.recordCount = properties.recordCount;
  }

  /**
   * How a buffer that did not reach its Bucket reads on the console.
   */
  override get warning(): string {
    return (
      `Simulated Kinesis Data Firehose delivery stream ` +
      `${this.deliveryStreamName} could not write to ` +
      `s3://${this.bucketName}/${this.objectKey}: ${this.reason}`
    );
  }
}

/**
 * The buffers a simulated Firehose scope could not deliver.
 *
 * Real Firehose answers a `PutRecord` long before the buffer that record joined
 * is delivered. A delivery that fails minutes later reaches the producer
 * through CloudWatch and the error output prefix, and neither of those is
 * simulated. Every failure is kept here for a test to read.
 */
export type SimFirehoseDeliveryFailures =
  SimFirehoseFailures<SimFirehoseDeliveryFailure>;

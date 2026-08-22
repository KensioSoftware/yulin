import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimFirehoseInvalidArgumentException } from "../error/sim-firehose.error.js";
import type { SimFirehoseKinesisSourceArn } from "./sim-firehose-kinesis-source-arn.js";

/**
 * How a delivery stream gets its records.
 *
 * `DirectPut` takes them from PutRecord and PutRecordBatch.
 * `KinesisStreamAsSource` reads them off a Kinesis stream, and a delivery
 * stream reading one takes no puts at all.
 */
export type SimFirehoseDeliveryStreamType =
  | "DirectPut"
  | "KinesisStreamAsSource";

/**
 * A delivery stream that takes the records a producer puts on it.
 */
export class SimFirehoseDirectPutSource {
  public readonly kind = "direct-put" as const;
  public readonly deliveryStreamType = "DirectPut" as const;

  /**
   * Take a put, which is where this delivery stream's records come from.
   */
  requirePut(): void {
    //
  }
}

interface SimFirehoseKinesisSourceProperties {
  readonly streamArn: SimFirehoseKinesisSourceArn;
  readonly roleArn: string;
  readonly startedAt: Date;
}

/**
 * A delivery stream that reads the records off a Kinesis stream.
 *
 * The Role is the one the reading is done as, so simulated IAM decides whether
 * this delivery stream may read its source exactly as it decides whether the
 * delivery Role may write the Bucket.
 *
 * Reading starts at the end of the stream, which is where real Firehose starts
 * when the delivery stream is created. The instant it started is what
 * DescribeDeliveryStream reports as `DeliveryStartTimestamp`, and records put
 * before it stay behind the delivery stream.
 */
export class SimFirehoseKinesisSource {
  public readonly kind = "kinesis-stream" as const;
  public readonly deliveryStreamType = "KinesisStreamAsSource" as const;
  public readonly streamArn: SimFirehoseKinesisSourceArn;
  public readonly roleArn: string;
  public readonly startedAt: Date;

  constructor(properties: SimFirehoseKinesisSourceProperties) {
    this.streamArn = properties.streamArn;
    this.roleArn = properties.roleArn;
    this.startedAt = properties.startedAt;
  }

  /**
   * The Role every read of this stream is made as.
   */
  get caller(): SimAwsCaller {
    return { kind: "arn", arn: this.roleArn };
  }

  /**
   * Refuse a put, as real Firehose refuses one on a delivery stream with a
   * Kinesis source.
   *
   * The records it delivers are the ones on its stream, and a producer putting
   * one here would be putting it somewhere the delivery stream never reads.
   */
  requirePut(operation: string, deliveryStreamName: string): void {
    throw new SimFirehoseInvalidArgumentException(
      `${operation} is not supported for the delivery stream ` +
        `${deliveryStreamName}, which reads its records from ` +
        `${this.streamArn.value}. Put the record onto that Kinesis stream ` +
        `instead.`,
    );
  }
}

/**
 * Where one delivery stream's records come from.
 */
export type SimFirehoseSource =
  | SimFirehoseDirectPutSource
  | SimFirehoseKinesisSource;

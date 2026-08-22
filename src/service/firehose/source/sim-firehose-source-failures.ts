import { SimFirehoseFailure } from "../failure/sim-firehose-failure.js";
import type { SimFirehoseFailures } from "../failure/sim-firehose-failures.js";
import type { SimFirehoseKinesisSource } from "./sim-firehose-source.js";

interface SimFirehoseSourceFailureProperties {
  readonly deliveryStreamName: string;
  readonly streamArn: string;
  readonly roleArn: string;
  readonly error: unknown;
}

/**
 * A source stream a delivery stream stopped reading.
 *
 * There is one of these per delivery stream at most. A read that fails stops
 * the delivery: the Role is refused every time it asks, and going round again
 * would record the same refusal for as long as the simulation ran.
 */
export class SimFirehoseSourceFailure extends SimFirehoseFailure {
  public readonly streamArn: string;

  constructor(properties: SimFirehoseSourceFailureProperties) {
    super(properties);
    this.streamArn = properties.streamArn;
  }

  /**
   * The failure of one delivery stream's read of the source it holds.
   */
  static of(
    deliveryStreamName: string,
    source: SimFirehoseKinesisSource,
    error: unknown,
  ): SimFirehoseSourceFailure {
    return new this({
      deliveryStreamName,
      streamArn: source.streamArn.value,
      roleArn: source.roleArn,
      error,
    });
  }

  /**
   * How a stream that could not be read reads on the console.
   */
  override get warning(): string {
    return `Simulated Kinesis Data Firehose delivery stream ${this.deliveryStreamName} stopped reading ${this.streamArn}: ${this.reason}`;
  }
}

/**
 * The source streams a simulated Firehose scope stopped reading.
 *
 * Real Firehose has no caller in front of it while it reads, and what stops the
 * read reaches an operator through CloudWatch, which is not simulated. Every
 * failure is kept here for a test to read.
 */
export type SimFirehoseSourceFailures =
  SimFirehoseFailures<SimFirehoseSourceFailure>;

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimFirehoseInvalidArgumentException } from "../error/sim-firehose.error.js";

/**
 * A Kinesis stream ARN carries the stream name after a `stream/` separator, and
 * a stream name holds no colon and no slash, so the ARN is read in one piece.
 *
 * The name is anchored to the end because a consumer ARN carries the consumer
 * name and its creation time after the stream name. Enhanced fan-out is
 * unsimulated, and a source naming a consumer has to be refused rather than
 * read as though it named the stream.
 */
const streamArnPattern =
  /^arn:aws:kinesis:(?<region>[a-z0-9-]+):(?<account>\d{12}):stream\/(?<stream>[\w.-]{1,128})$/u;

/**
 * The Kinesis stream ARN a delivery stream reads from.
 *
 * Everything the read needs comes out of it: the ARN the Kinesis calls name,
 * and the Account and Region, which decide whether this simulated Firehose can
 * reach the stream at all.
 */
export class SimFirehoseKinesisSourceArn {
  /**
   * How an ARN naming a source stream is written, for a refusal to say what it
   * wanted instead.
   */
  static readonly arnShape =
    "A Kinesis stream ARN is " +
    "arn:aws:kinesis:<region>:<account-id>:stream/<stream-name>";

  public readonly value: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly streamName: string;

  private constructor(value: string, parts: Record<string, string>) {
    this.value = value;
    this.regionName = parts["region"] ?? "";
    this.accountId = parts["account"] ?? "";
    this.streamName = parts["stream"] ?? "";
  }

  /**
   * Read a stream ARN, refusing one that is not a stream ARN at all.
   */
  static of(value: string | undefined): SimFirehoseKinesisSourceArn {
    if (value === undefined || value === "") {
      throw new SimFirehoseInvalidArgumentException(
        "The KinesisStreamSourceConfiguration is missing KinesisStreamARN",
      );
    }

    const parts = streamArnPattern.exec(value)?.groups;

    if (parts === undefined) {
      throw new SimFirehoseInvalidArgumentException(
        `The source KinesisStreamARN ${value} does not name a Kinesis ` +
          `stream. ${this.arnShape}`,
      );
    }

    return new this(value, parts);
  }

  /**
   * Whether this stream is in an Account and Region.
   */
  isIn(scope: SimAwsAccountRegionScope): boolean {
    return (
      this.accountId === scope.accountId && this.regionName === scope.regionName
    );
  }
}

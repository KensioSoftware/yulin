import { SimLambdaInvalidParameterValueException } from "../../../error/sim-lambda.error.js";
import type { SimLambdaEventSourceBatchRules } from "../../sim-lambda-event-source-batch-rules.js";
import { SimLambdaEventSourcePollingPermission } from "../../sim-lambda-event-source-polling-permission.js";
import type { SimLambdaEventSourceStartingPositionRules } from "../../sim-lambda-event-source-starting-position.js";
import {
  kinesisStreamBatchRules,
  kinesisStreamPollingOperations,
  kinesisStreamStartingPositionRules,
} from "./sim-lambda-kinesis-event-source-rules.js";

/**
 * A Kinesis stream ARN carries the stream name after a `stream/` separator, and
 * a stream name holds no colon and no slash, so the ARN is read in one piece.
 *
 * A consumer ARN carries the consumer name and its creation time after the
 * stream name, which is why the name is anchored to the end here: enhanced
 * fan-out is unsimulated, and a mapping naming a consumer has to be refused
 * rather than polled as though it named the stream.
 */
const streamArnPattern =
  /^arn:aws:kinesis:(?<region>[a-z0-9-]+):(?<account>\d{12}):stream\/(?<stream>[\w.-]{1,128})$/u;

/**
 * The Kinesis stream ARN an event source mapping is created for.
 *
 * Everything a poller needs comes out of it: the ARN the Kinesis calls name,
 * the Region the event records report, and the stream name, which is what a
 * refusal names when a function writes back into its own source.
 */
export class SimLambdaKinesisEventSourceArn {
  /**
   * How an ARN naming this kind of event source is written, for a refusal to
   * say what it wanted instead.
   */
  static readonly arnShape =
    "A Kinesis stream ARN is " +
    "arn:aws:kinesis:<region>:<account-id>:stream/<stream-name>";

  public readonly kind = "kinesis-stream" as const;
  public readonly serviceLabel = "Kinesis Data Streams";
  public readonly value: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly streamName: string;
  public readonly pollingPermissions: readonly SimLambdaEventSourcePollingPermission[];

  private constructor(value: string, parts: Record<string, string>) {
    this.value = value;
    this.regionName = parts["region"] ?? "";
    this.accountId = parts["account"] ?? "";
    this.streamName = parts["stream"] ?? "";
    this.pollingPermissions = [
      ...kinesisStreamPollingOperations.map(
        (operation) =>
          new SimLambdaEventSourcePollingPermission(
            `kinesis:${operation}`,
            value,
          ),
      ),
      new SimLambdaEventSourcePollingPermission("kinesis:ListStreams", "*"),
    ];
  }

  /**
   * Read a stream ARN, answering with nothing when the ARN names something
   * else.
   *
   * This is what the event source ARN dispatcher asks, so that deciding what a
   * mapping may name stays in one place rather than in each parser.
   */
  static parse(streamArn: string): SimLambdaKinesisEventSourceArn | undefined {
    const parts = streamArnPattern.exec(streamArn)?.groups;

    if (parts === undefined) {
      return undefined;
    }

    return new this(streamArn, parts);
  }

  /**
   * Read a stream ARN, refusing one that is not a stream ARN at all.
   */
  static of(streamArn: string): SimLambdaKinesisEventSourceArn {
    const parsed = this.parse(streamArn);

    if (parsed === undefined) {
      throw new SimLambdaInvalidParameterValueException(
        `${streamArn} is not a Kinesis stream ARN. ${this.arnShape}`,
      );
    }

    return parsed;
  }

  /**
   * The batch sizes a mapping on this stream may deliver with.
   */
  get batchRules(): SimLambdaEventSourceBatchRules {
    return kinesisStreamBatchRules;
  }

  /**
   * The starting positions a mapping on this stream may be created with.
   */
  get startingPositionRules(): SimLambdaEventSourceStartingPositionRules {
    return kinesisStreamStartingPositionRules;
  }

  /**
   * Whether this stream is in an Account and Region.
   */
  isIn(accountId: string, regionName: string): boolean {
    return this.accountId === accountId && this.regionName === regionName;
  }
}

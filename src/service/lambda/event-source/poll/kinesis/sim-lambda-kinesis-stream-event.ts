import type { SimLambdaKinesisEventSourceArn } from "../../stream/kinesis/sim-lambda-kinesis-event-source-arn.js";
import type { SimLambdaKinesisStreamRecord } from "../../stream/kinesis/sim-lambda-kinesis-streams.js";
import type {
  SimLambdaKinesisStreamEvent,
  SimLambdaKinesisStreamEventRecord,
  SimLambdaKinesisStreamEventRecordBody,
} from "./sim-lambda-kinesis-stream-event.types.js";

const millisecondsPerSecond = 1000;

/**
 * The schema version every Kinesis event record carries.
 *
 * Real Lambda has only ever sent 1.0, and a function that reads it is reading a
 * constant.
 */
const kinesisSchemaVersion = "1.0";

interface SimLambdaKinesisStreamEventBuilderProperties {
  readonly eventSourceArn: SimLambdaKinesisEventSourceArn;
  readonly shardId: string;
  readonly roleArn: string;
}

/**
 * Builds the Kinesis stream event for one batch of polled records.
 *
 * The casing here is the event's own and is not a tidy scheme: `eventID` has a
 * capital ID, `kinesis` has none, `eventSourceARN` has a capital ARN, and the
 * block inside `kinesis` is lower-cased where the DynamoDB one is capitalized.
 * All of it is what a function actually receives, so all of it is written out.
 *
 * The two real translations are the payload and the instant. Kinesis hands a
 * poller raw bytes and a `Date`, and a function receives base64 text and epoch
 * seconds, which is what makes the event JSON a handler can be given.
 */
export class SimLambdaKinesisStreamEventBuilder {
  private readonly eventSourceArn: SimLambdaKinesisEventSourceArn;
  private readonly shardId: string;
  private readonly roleArn: string;

  constructor(properties: SimLambdaKinesisStreamEventBuilderProperties) {
    this.eventSourceArn = properties.eventSourceArn;
    this.shardId = properties.shardId;
    this.roleArn = properties.roleArn;
  }

  /**
   * The event for a batch of records.
   */
  of(
    records: readonly SimLambdaKinesisStreamRecord[],
  ): SimLambdaKinesisStreamEvent {
    return { Records: records.map((record) => this.record(record)) };
  }

  /**
   * The identifier one record is named by in the event.
   *
   * Real Lambda joins the shard the record was read from to the record's own
   * sequence number, so it is unique across the whole stream rather than within
   * one shard.
   */
  eventIdOf(record: SimLambdaKinesisStreamRecord): string {
    return `${this.shardId}:${record.SequenceNumber ?? ""}`;
  }

  private record(
    record: SimLambdaKinesisStreamRecord,
  ): SimLambdaKinesisStreamEventRecord {
    return {
      eventID: this.eventIdOf(record),
      eventName: "aws:kinesis:record",
      eventVersion: kinesisSchemaVersion,
      eventSource: "aws:kinesis",
      awsRegion: this.eventSourceArn.regionName,
      kinesis: eventRecordBody(record),
      eventSourceARN: this.eventSourceArn.value,
      // Real Lambda names the execution role it read the record with, which is
      // the role this poll was made as.
      invokeIdentityArn: this.roleArn,
    };
  }
}

/**
 * The Kinesis block of one event record.
 */
function eventRecordBody(
  record: SimLambdaKinesisStreamRecord,
): SimLambdaKinesisStreamEventRecordBody {
  const arrivedAt = record.ApproximateArrivalTimestamp;

  return {
    kinesisSchemaVersion,
    partitionKey: record.PartitionKey ?? "",
    sequenceNumber: record.SequenceNumber ?? "",
    data: Buffer.from(record.Data ?? new Uint8Array()).toString("base64"),
    // Epoch seconds, where the API gives an instant. Real Lambda sends
    // fractional seconds, which is what keeps two records put in the same
    // second apart.
    approximateArrivalTimestamp:
      arrivedAt === undefined ? 0 : arrivedAt.getTime() / millisecondsPerSecond,
  };
}

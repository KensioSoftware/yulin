import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimKinesisStreamActivity } from "../../stream/sim-kinesis-stream-activity.js";
import type { SimKinesisRequestOptions } from "../sim-kinesis-request-options.js";
import type { SimKinesisStreamAccess } from "../sim-kinesis-stream-access.js";
import { simKinesisReadPutBatch } from "./sim-kinesis-put-batch.js";
import { simKinesisReadPutEntry } from "./sim-kinesis-put-entry.js";
import type {
  SimPutRecordCommand,
  SimPutRecordCommandOutput,
  SimPutRecordsCommand,
  SimPutRecordsCommandOutput,
} from "./record.command.js";

interface SimKinesisPutCommandsProperties {
  readonly access: SimKinesisStreamAccess;
  readonly activity: SimKinesisStreamActivity;
  readonly background: BackgroundScheduler;
}

/**
 * The commands that put records onto a stream.
 */
export class SimKinesisPutCommands {
  private readonly access: SimKinesisStreamAccess;
  private readonly activity: SimKinesisStreamActivity;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimKinesisPutCommandsProperties) {
    this.access = properties.access;
    this.activity = properties.activity;
    this.background = properties.background;
  }

  /**
   * Put one record onto a stream.
   *
   * `SequenceNumberForOrdering` is accepted and needs nothing done with it.
   * Real Kinesis uses it to guarantee that this record's sequence number is
   * higher than the one it names, and a single counter per stream gives that
   * for every record here whether or not a request asks for it.
   */
  putRecord(
    command: SimPutRecordCommand,
    options?: SimKinesisRequestOptions,
  ): SimPutRecordCommandOutput {
    const { input } = command;
    const stream = this.access.require("kinesis:PutRecord", input, options);
    const entry = simKinesisReadPutEntry(input);
    const placement = stream.put({ ...entry, at: this.background.now() });

    this.activity.recordsAvailable(stream.arn);

    return {
      $metadata: {},
      ShardId: placement.shardId,
      SequenceNumber: placement.sequenceNumber,
    };
  }

  /**
   * Put a batch of records onto a stream.
   *
   * Every record that reaches the stream is reported back with the shard it
   * landed on. Nothing here fails a record on its own, since the reasons real
   * Kinesis does are throughput limits and internal faults, neither of which is
   * simulated. `FailedRecordCount` is therefore zero, and the per-record shape
   * is still what a consumer of the response reads.
   */
  putRecords(
    command: SimPutRecordsCommand,
    options?: SimKinesisRequestOptions,
  ): SimPutRecordsCommandOutput {
    const { input } = command;
    const stream = this.access.require("kinesis:PutRecords", input, options);
    const entries = simKinesisReadPutBatch(input.Records);
    const at = this.background.now();
    const placements = entries.map((entry) => stream.put({ ...entry, at }));

    // Once, for the batch, rather than once per record. A poller woken by the
    // first record would read the rest of the batch in the same turn anyway.
    this.activity.recordsAvailable(stream.arn);

    return {
      $metadata: {},
      FailedRecordCount: 0,
      Records: placements.map((placement) => ({
        ShardId: placement.shardId,
        SequenceNumber: placement.sequenceNumber,
      })),
    };
  }
}

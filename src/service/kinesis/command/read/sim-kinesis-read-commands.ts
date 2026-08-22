import type { BackgroundScheduler } from "../../../../util/background/background.js";
import {
  readSimKinesisShardIteratorToken,
  simKinesisShardIteratorToken,
} from "../../stream/sim-kinesis-shard-iterator.js";
import { simKinesisShardRead } from "../../stream/sim-kinesis-stream-read.js";
import type { SimKinesisStreamStore } from "../../stream/sim-kinesis-stream-store.js";
import type { SimKinesisRequestOptions } from "../sim-kinesis-request-options.js";
import type { SimKinesisStreamAccess } from "../sim-kinesis-stream-access.js";
import { simKinesisIteratorPosition } from "./sim-kinesis-iterator-type.js";
import {
  assertSimKinesisStreamArnMatches,
  simKinesisReadLimit,
  simKinesisRequiredShardId,
} from "./sim-kinesis-read-inputs.js";
import {
  simKinesisMillisBehindLatest,
  simKinesisRecordOutput,
} from "./sim-kinesis-read-output.js";
import type {
  SimGetRecordsCommand,
  SimGetRecordsCommandOutput,
  SimGetShardIteratorCommand,
  SimGetShardIteratorCommandOutput,
} from "./read.command.js";

interface SimKinesisReadCommandsProperties {
  readonly streams: SimKinesisStreamStore;
  readonly access: SimKinesisStreamAccess;
  readonly background: BackgroundScheduler;
}

/**
 * The commands that read records off a stream's shards.
 */
export class SimKinesisReadCommands {
  private readonly streams: SimKinesisStreamStore;
  private readonly access: SimKinesisStreamAccess;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimKinesisReadCommandsProperties) {
    this.streams = properties.streams;
    this.access = properties.access;
    this.background = properties.background;
  }

  /**
   * Hand out an iterator standing for a place on one shard of a stream.
   *
   * Retention is left to the read. An iterator is a place rather than a record,
   * and every place it can stand at survives the records around it being
   * trimmed.
   */
  getShardIterator(
    command: SimGetShardIteratorCommand,
    options?: SimKinesisRequestOptions,
  ): SimGetShardIteratorCommandOutput {
    const { input } = command;
    const stream = this.access.require(
      "kinesis:GetShardIterator",
      input,
      options,
    );
    const shard = stream.requireShard(simKinesisRequiredShardId(input.ShardId));

    return {
      $metadata: {},
      ShardIterator: simKinesisShardIteratorToken({
        streamArn: stream.arn,
        shardId: shard.shardId,
        position: simKinesisIteratorPosition(input, shard),
      }),
    };
  }

  /**
   * Read records from wherever an iterator stands.
   *
   * The iterator carries the stream it was made against, so the action is
   * authorized against that stream rather than against whatever the request
   * separately claims. A caller cannot reach a stream it lacks permission for
   * by holding an iterator someone else made.
   */
  getRecords(
    command: SimGetRecordsCommand,
    options?: SimKinesisRequestOptions,
  ): SimGetRecordsCommandOutput {
    const iterator = readSimKinesisShardIteratorToken(
      command.input.ShardIterator,
    );

    assertSimKinesisStreamArnMatches(
      command.input.StreamARN,
      iterator.streamArn,
    );

    const stream = this.access.require(
      "kinesis:GetRecords",
      { StreamARN: iterator.streamArn },
      options,
    );
    const now = this.background.now();

    this.streams.applyRetention(now);

    const shard = stream.requireShard(iterator.shardId);
    const read = simKinesisShardRead(
      shard,
      iterator.position,
      simKinesisReadLimit(command.input.Limit),
    );

    return {
      $metadata: {},
      Records: read.records.map((record) => simKinesisRecordOutput(record)),
      NextShardIterator: simKinesisShardIteratorToken({
        streamArn: stream.arn,
        shardId: shard.shardId,
        position: read.next,
      }),
      MillisBehindLatest: simKinesisMillisBehindLatest(
        shard.records,
        read.records,
        now,
      ),
    };
  }
}

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimKinesisResourceNotFoundException } from "../error/sim-kinesis.error.js";
import { simKinesisPartitionKeyHash } from "./sim-kinesis-hash-key.js";
import { SimKinesisRecord } from "./sim-kinesis-record.js";
import { simKinesisTrimPoint } from "./sim-kinesis-retention.js";
import { SimKinesisSequenceNumbers } from "./sim-kinesis-sequence-numbers.js";
import type { SimKinesisShard } from "./sim-kinesis-shard.js";
import { SimKinesisShardMap } from "./sim-kinesis-shard-map.js";
import { simKinesisStreamArn } from "./sim-kinesis-stream-arn.js";
import type { SimKinesisStreamMode } from "./sim-kinesis-stream-mode.js";
import type { SimKinesisStreamName } from "./sim-kinesis-stream-name.js";

/**
 * Where a stream is between being created and being deleted.
 *
 * Real Kinesis also has `CREATING`, `DELETING` and `UPDATING`, which it passes
 * through while it brings shards up or takes them down. Nothing here takes any
 * time over that, so a stream is `ACTIVE` from the moment it exists.
 */
export type SimKinesisStreamStatus = "ACTIVE";

interface SimKinesisStreamProperties {
  readonly name: SimKinesisStreamName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly mode: SimKinesisStreamMode;
  readonly shardCount: number;
  readonly retentionHours: number;
  readonly createdAt: Date;
  readonly tags: Readonly<Record<string, string>>;
}

/**
 * What one record a caller is putting carries.
 */
export interface SimKinesisPut {
  readonly partitionKey: string;
  readonly explicitHashKey: bigint | undefined;
  readonly data: Uint8Array;
  readonly at: Date;
}

/**
 * Where a put record landed.
 */
export interface SimKinesisPutPlacement {
  readonly shardId: string;
  readonly sequenceNumber: string;
}

/**
 * One simulated Kinesis data stream, and the shards its records are on.
 */
export class SimKinesisStream {
  public readonly name: string;
  public readonly arn: string;
  public readonly mode: SimKinesisStreamMode;
  public readonly createdAt: Date;
  public readonly status: SimKinesisStreamStatus = "ACTIVE";

  /**
   * The tags the stream was created with.
   *
   * Nothing reads these back through a command, since the Kinesis tag
   * operations are unsimulated. They are kept so that a stream created from a
   * template carrying tags is the stream the template described, and so a test
   * can check them through the simulator's own accessor.
   */
  public readonly tags: Readonly<Record<string, string>>;

  private readonly sequenceNumbers = new SimKinesisSequenceNumbers();
  private readonly shardMap: SimKinesisShardMap;
  private readonly retention: number;

  constructor(properties: SimKinesisStreamProperties) {
    this.name = properties.name.value;
    this.arn = simKinesisStreamArn(
      properties.accountRegionScope,
      properties.name.value,
    );
    this.mode = properties.mode;
    this.createdAt = properties.createdAt;
    this.tags = properties.tags;
    this.retention = properties.retentionHours;
    this.shardMap = new SimKinesisShardMap({
      shardCount: properties.shardCount,
      sequenceNumbers: this.sequenceNumbers,
    });
  }

  /**
   * The shards of this stream, in the order they were opened.
   */
  get shards(): readonly SimKinesisShard[] {
    return this.shardMap.shards;
  }

  /**
   * How long this stream keeps a record.
   */
  get retentionHours(): number {
    return this.retention;
  }

  /**
   * Resolve a shard of this stream, or refuse.
   */
  requireShard(shardId: string): SimKinesisShard {
    const found = this.shardMap.find(shardId);

    if (found === undefined) {
      throw new SimKinesisResourceNotFoundException(
        `Shard ${shardId} does not exist in stream ${this.name}`,
      );
    }

    return found;
  }

  /**
   * Put one record onto the shard its partition key falls on.
   *
   * An explicit hash key overrides the partition key for that placement, which
   * is what real Kinesis does with one. The partition key is still carried on
   * the record and handed back to whoever reads it.
   */
  put(record: SimKinesisPut): SimKinesisPutPlacement {
    const shard = this.shardMap.covering(
      record.explicitHashKey ?? simKinesisPartitionKeyHash(record.partitionKey),
    );
    const sequenceNumber = this.sequenceNumbers.take();

    shard.append(
      new SimKinesisRecord({
        partitionKey: record.partitionKey,
        explicitHashKey: record.explicitHashKey,
        data: record.data,
        sequenceNumber,
        arrivedAt: record.at,
      }),
    );

    return { shardId: shard.shardId, sequenceNumber };
  }

  /**
   * Drop whatever the retention window has outlived, on every shard.
   *
   * This is applied when the stream is read rather than scheduled, which is
   * what `simKinesisTrimPoint` explains. Running it twice at one instant does
   * nothing the second time.
   */
  applyRetention(instant: Date): void {
    this.shardMap.trim(simKinesisTrimPoint(instant, this.retention));
  }
}

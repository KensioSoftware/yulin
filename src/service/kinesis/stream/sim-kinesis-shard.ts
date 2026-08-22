import type { SimKinesisHashKeyRange } from "./sim-kinesis-hash-key.js";
import type { SimKinesisRecord } from "./sim-kinesis-record.js";

/**
 * How many digits Kinesis pads a shard identifier's ordinal to.
 */
const shardOrdinalDigits = 12;

/**
 * The identifier the shard at an ordinal carries.
 *
 * Kinesis shapes these as `shardId-000000000000`, counting from zero, and a
 * consumer that stores a shard identifier stores that string.
 */
export function simKinesisShardId(ordinal: number): string {
  return `shardId-${ordinal.toString().padStart(shardOrdinalDigits, "0")}`;
}

interface SimKinesisShardProperties {
  readonly ordinal: number;
  readonly hashKeyRange: SimKinesisHashKeyRange;
  readonly startingSequenceNumber: string;
}

/**
 * One shard of one stream, and the records put onto it.
 *
 * A shard owns a slice of the hash key space, and it takes the records whose
 * partition keys hash into that slice. Nothing here splits or merges: a shard
 * is opened when the stream is created and stays open for the life of it.
 */
export class SimKinesisShard {
  public readonly shardId: string;
  public readonly hashKeyRange: SimKinesisHashKeyRange;

  /**
   * The sequence number this shard opened at.
   *
   * Real Kinesis gives a shard one when it is created, before any record is on
   * it, and reports it in the shard's sequence number range. It stays where it
   * is as records are put and trimmed, so it is a fact about the shard rather
   * than about what the shard currently holds.
   */
  public readonly startingSequenceNumber: string;

  private readonly written: SimKinesisRecord[] = [];

  constructor(properties: SimKinesisShardProperties) {
    this.shardId = simKinesisShardId(properties.ordinal);
    this.hashKeyRange = properties.hashKeyRange;
    this.startingSequenceNumber = properties.startingSequenceNumber;
  }

  /**
   * The records on this shard, oldest first.
   */
  get records(): readonly SimKinesisRecord[] {
    return this.written;
  }

  /**
   * The sequence number of the newest record on this shard.
   */
  get latestSequenceNumber(): string | undefined {
    return this.written.at(-1)?.sequenceNumber;
  }

  /**
   * Whether a hash key falls in this shard's slice of the space.
   */
  covers(hashKey: bigint): boolean {
    const { startingHashKey, endingHashKey } = this.hashKeyRange;

    return hashKey >= startingHashKey && hashKey <= endingHashKey;
  }

  /**
   * Put a record onto this shard.
   */
  append(record: SimKinesisRecord): void {
    this.written.push(record);
  }

  /**
   * Drop the records put before an instant.
   *
   * Real Kinesis moves a reader asking for a trimmed position on to the trim
   * horizon rather than refusing it, so nothing here has to remember how far
   * trimming got.
   */
  trim(before: Date): void {
    const surviving = this.written.findIndex(
      (record) => record.arrivedAt.getTime() >= before.getTime(),
    );

    this.written.splice(0, surviving === -1 ? this.written.length : surviving);
  }
}

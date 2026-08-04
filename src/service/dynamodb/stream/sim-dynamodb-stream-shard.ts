import { randomUUID } from "node:crypto";
import type { SimDynamoDbStreamRecord } from "./sim-dynamodb-stream-record.js";

/**
 * How many digits DynamoDB pads a shard identifier's instant to.
 */
const shardInstantDigits = 20;

/**
 * The identifier a shard opened at an instant carries.
 *
 * DynamoDB shapes these as `shardId-00000001414562045508-2bac9cd2`: the instant
 * the shard opened, padded, and then something to tell two shards opened at one
 * instant apart.
 */
function shardId(at: Date): string {
  const opened = at.getTime().toString().padStart(shardInstantDigits, "0");

  return `shardId-${opened}-${randomUUID().slice(0, 8)}`;
}

/**
 * The one shard of one stream, and the records written to it.
 *
 * AWS documents an open shard as corresponding to one table partition, and a
 * simulated table is always one partition, so one shard per stream is accurate
 * rather than a shortcut. Nothing here splits: a shard is opened when the
 * stream is enabled and closed when it is disabled.
 *
 * The total order that gives across every key is stronger than the per-key
 * order AWS guarantees. A consumer relying on it here would be relying on
 * something real DynamoDB does not promise.
 */
export class SimDynamoDbStreamShard {
  public readonly shardId: string;

  private readonly written: SimDynamoDbStreamRecord[] = [];
  private open = true;
  private trimmed: string | undefined;
  private first: string | undefined;
  private last: string | undefined;

  constructor(at: Date) {
    this.shardId = shardId(at);
  }

  /**
   * Whether this shard is still taking records.
   */
  get isOpen(): boolean {
    return this.open;
  }

  /**
   * The records written to this shard, oldest first.
   */
  get records(): readonly SimDynamoDbStreamRecord[] {
    return this.written;
  }

  /**
   * The sequence number of the last record trimmed off this shard, when the
   * retention window has outlived one.
   */
  get trimmedThrough(): string | undefined {
    return this.trimmed;
  }

  /**
   * The sequence number this shard starts at.
   *
   * This is the first record ever written to it rather than the oldest one it
   * still holds. A shard's range is fixed as the records go on: trimming takes
   * records away without moving where the shard began, and TRIM_HORIZON is what
   * a reader uses to find the oldest record it can still reach.
   */
  get startingSequenceNumber(): string | undefined {
    return this.first;
  }

  /**
   * The sequence number this shard ends at, which only a closed one has.
   *
   * An open shard has no ending sequence number, since the next record written
   * would move it. That absence is how a reader tells a shard that is still
   * taking changes from one it can finish with.
   */
  get endingSequenceNumber(): string | undefined {
    return this.open ? undefined : this.last;
  }

  /**
   * Write a record to this shard.
   */
  append(record: SimDynamoDbStreamRecord): void {
    this.written.push(record);
    this.first ??= record.sequenceNumber;
    this.last = record.sequenceNumber;
  }

  /**
   * Drop the records written before an instant, remembering how far that got.
   *
   * The trim point is kept once the records themselves are gone, because it is
   * the difference between a reader that asked for a position this shard never
   * reached and one that asked for a position it has already dropped.
   */
  trim(before: Date): void {
    const surviving = this.written.findIndex(
      (record) =>
        record.approximateCreationDateTime.getTime() >= before.getTime(),
    );
    const outlived = surviving === -1 ? this.written.length : surviving;

    if (outlived === 0) {
      return;
    }

    this.trimmed = this.written[outlived - 1]?.sequenceNumber ?? this.trimmed;
    this.written.splice(0, outlived);
  }

  /**
   * Close this shard to further records.
   *
   * What is already on it stays readable: disabling a stream stops it taking
   * changes rather than throwing away the ones it took.
   */
  close(): void {
    this.open = false;
  }
}

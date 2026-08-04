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
   * Write a record to this shard.
   */
  append(record: SimDynamoDbStreamRecord): void {
    this.written.push(record);
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

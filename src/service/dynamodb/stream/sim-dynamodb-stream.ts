import type { SimArn } from "../../aws/arn.js";
import type { SimDynamoDbStreamViewType } from "./sim-dynamodb-stream.types.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import type { SimDynamoDbItemChange } from "./sim-dynamodb-item-change.js";
import {
  simDynamoDbStreamArn,
  simDynamoDbStreamLabel,
} from "./sim-dynamodb-stream-arn.js";
import { SimDynamoDbStreamRecord } from "./sim-dynamodb-stream-record.js";
import { SimDynamoDbStreamSequenceNumbers } from "./sim-dynamodb-stream-sequence-numbers.js";
import { SimDynamoDbStreamShard } from "./sim-dynamodb-stream-shard.js";

/**
 * Where a stream is between being enabled and being disabled.
 *
 * Real DynamoDB also has `ENABLING` and `DISABLING`, which it passes through
 * while it brings the stream up or takes it down. Nothing here takes any time
 * over either, so a stream switches straight between the two settled states.
 */
export type SimDynamoDbStreamStatus = "ENABLED" | "DISABLED";

interface SimDynamoDbStreamProperties {
  readonly tableName: string;
  readonly tableArn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly viewType: SimDynamoDbStreamViewType;
  readonly enabledAt: Date;
}

/**
 * One stream of one table: everything that changed while it was on.
 *
 * A stream is made when a stream is enabled and is never remade. Disabling one
 * and enabling another gives the table a second stream with a label and an ARN
 * of its own, which is why the table holds these rather than being one.
 *
 * The key schema is held here because a record's `Keys` are cut with it, and a
 * table's key schema never changes, so the stream can be given it once.
 */
export class SimDynamoDbStream {
  public readonly arn: SimArn;
  public readonly label: string;
  public readonly tableName: string;
  public readonly tableArn: SimArn;
  public readonly viewType: SimDynamoDbStreamViewType;
  public readonly enabledAt: Date;
  public readonly shard: SimDynamoDbStreamShard;

  private readonly keySchema: SimDynamoDbKeySchema;
  private readonly sequenceNumbers = new SimDynamoDbStreamSequenceNumbers();
  private enabled = true;

  constructor(properties: SimDynamoDbStreamProperties) {
    this.label = simDynamoDbStreamLabel(properties.enabledAt);
    this.arn = simDynamoDbStreamArn(properties.tableArn, this.label);
    this.tableName = properties.tableName;
    this.tableArn = properties.tableArn;
    this.viewType = properties.viewType;
    this.enabledAt = properties.enabledAt;
    this.keySchema = properties.keySchema;
    this.shard = new SimDynamoDbStreamShard(properties.enabledAt);
  }

  /**
   * Whether this stream is still taking the table's changes.
   */
  get status(): SimDynamoDbStreamStatus {
    return this.enabled ? "ENABLED" : "DISABLED";
  }

  /**
   * The records this stream has taken, oldest first.
   */
  get records(): readonly SimDynamoDbStreamRecord[] {
    return this.shard.records;
  }

  /**
   * Take one change to the table's items.
   *
   * Capture is eager, and that is deliberately against the house style. An
   * index is derived when it is read because an index is a function of the
   * table's current state. A stream is not: put A, then B, then A leaves state
   * A while owing two `MODIFY` records, and an insert followed by a delete
   * leaves the table empty while owing an `INSERT` and a `REMOVE`. Nothing
   * readable afterwards reconstructs either, so the transition is written down
   * as it happens.
   */
  capture(change: SimDynamoDbItemChange, at: Date): SimDynamoDbStreamRecord {
    const record = new SimDynamoDbStreamRecord({
      change,
      keySchema: this.keySchema,
      viewType: this.viewType,
      sequenceNumber: this.sequenceNumbers.take(),
      at,
    });

    this.shard.append(record);

    return record;
  }

  /**
   * Stop this stream taking the table's changes.
   *
   * The records already on it stay where they are. Real DynamoDB keeps a
   * disabled stream readable for the rest of its retention window, and closing
   * the shard is how a reader finds out there will be no more.
   */
  disable(): void {
    this.enabled = false;
    this.shard.close();
  }
}

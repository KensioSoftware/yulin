import type { SimArn } from "../../aws/arn.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import type {
  SimDynamoDbStreamSpecificationDescription,
  SimDynamoDbStreamViewType,
} from "./sim-dynamodb-stream.types.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import type {
  SimDynamoDbItemChange,
  SimDynamoDbItemChanges,
} from "./sim-dynamodb-item-change.js";
import { SimDynamoDbStream } from "./sim-dynamodb-stream.js";
import { SimDynamoDbStreamActivity } from "./sim-dynamodb-stream-activity.js";
import { simDynamoDbStreamLabelInstant } from "./sim-dynamodb-stream-arn.js";
import type { SimDynamoDbStreamRequest } from "./sim-dynamodb-stream-specification.js";
import { SimDynamoDbStreamStore } from "./sim-dynamodb-stream-store.js";

interface SimDynamoDbTableStreamProperties {
  readonly tableName: string;
  readonly tableArn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly clock: SimClock;
  readonly streams?: SimDynamoDbStreamStore | undefined;
  readonly activity?: SimDynamoDbStreamActivity | undefined;
}

/**
 * One table's stream: the setting, and what the changes are captured on.
 *
 * The setting and the log are held together for the same reason time to live
 * holds the setting and the removals it drives: switching the setting on is
 * what gives the table somewhere to write its changes, and switching it off is
 * what stops it.
 *
 * A table can have had several streams over its life, since disabling one and
 * enabling another makes a second with a label and an ARN of its own. Only one
 * of them is ever taking changes. `latest` is the one `LatestStreamArn` names,
 * which real DynamoDB goes on reporting after the stream has been switched off.
 */
export class SimDynamoDbTableStream implements SimDynamoDbItemChanges {
  private readonly tableName: string;
  private readonly tableArn: SimArn;
  private readonly keySchema: SimDynamoDbKeySchema;
  private readonly clock: SimClock;
  private readonly streams: SimDynamoDbStreamStore;
  private readonly activity: SimDynamoDbStreamActivity;
  private enabled: SimDynamoDbStream | undefined;
  private newest: SimDynamoDbStream | undefined;

  constructor(properties: SimDynamoDbTableStreamProperties) {
    this.tableName = properties.tableName;
    this.tableArn = properties.tableArn;
    this.keySchema = properties.keySchema;
    this.clock = properties.clock;
    this.streams = properties.streams ?? new SimDynamoDbStreamStore();
    this.activity = properties.activity ?? new SimDynamoDbStreamActivity();
  }

  /**
   * The stream taking this table's changes, when one is switched on.
   */
  get current(): SimDynamoDbStream | undefined {
    return this.enabled;
  }

  /**
   * The last stream this table had, switched on or not.
   */
  get latest(): SimDynamoDbStream | undefined {
    return this.newest;
  }

  /**
   * How this table reports its stream setting, when it has ever had one.
   *
   * A table that has never had a stream reports no `StreamSpecification` at
   * all, rather than one saying it is off, which is how a caller tells a table
   * that never had a stream from one whose stream was switched off.
   */
  specification(): SimDynamoDbStreamSpecificationDescription | undefined {
    if (this.enabled !== undefined) {
      return { StreamEnabled: true, StreamViewType: this.enabled.viewType };
    }

    return this.newest === undefined ? undefined : { StreamEnabled: false };
  }

  /**
   * Apply a stream request that has already been checked against this table.
   *
   * Nothing here refuses anything. A request asking for the stream the table
   * already has, or for the removal of one it does not have, was refused while
   * the request was being read.
   */
  apply(request: SimDynamoDbStreamRequest | undefined): void {
    if (request === undefined) {
      return;
    }

    if (request.enabled) {
      this.enable(request.viewType);

      return;
    }

    this.disable();
  }

  /**
   * Take one change to the table's items.
   *
   * This is the choke point every item mutation passes through exactly once. A
   * table with no stream on captures nothing, which is the ordinary case and
   * costs one comparison.
   */
  capture(change: SimDynamoDbItemChange): void {
    const stream = this.enabled;

    if (stream === undefined) {
      return;
    }

    stream.capture(change, this.clock.now());
    this.activity.recordsAvailable(stream.arn);
  }

  /**
   * Switch a stream on, which makes a new one.
   *
   * The label and the ARN come from the instant it was enabled, so re-enabling
   * a stream gives a different ARN to the one the table had before. Anything
   * holding the old ARN is holding the old stream, as it would be on AWS.
   */
  private enable(viewType: SimDynamoDbStreamViewType): void {
    const enabledAt = simDynamoDbStreamLabelInstant(
      this.clock.now(),
      this.newest?.enabledAt,
    );
    const stream = new SimDynamoDbStream({
      tableName: this.tableName,
      tableArn: this.tableArn,
      keySchema: this.keySchema,
      viewType,
      enabledAt,
    });

    this.enabled = stream;
    this.newest = stream;
    this.streams.add(stream);
  }

  /**
   * Switch the stream off, leaving what it captured where it is.
   */
  private disable(): void {
    this.enabled?.disable();
    this.enabled = undefined;
  }
}

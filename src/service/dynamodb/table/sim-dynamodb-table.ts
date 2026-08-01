import { randomUUID } from "node:crypto";
import type { SimArn } from "../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../util/background/background.js";
import type {
  SimDynamoDbTableClass,
  SimDynamoDbTableDescription,
  SimDynamoDbTableStatus,
} from "../command/table/table.types.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbTimeToLiveDescription } from "../command/time-to-live/time-to-live.types.js";
import { SimDynamoDbTableExpiry } from "../time-to-live/sim-dynamodb-table-expiry.js";
import { SimDynamoDbTimeToLive } from "../time-to-live/sim-dynamodb-time-to-live.js";
import type { SimDynamoDbTimeToLiveSpecification } from "../time-to-live/sim-dynamodb-time-to-live-specification.js";
import type { SimDynamoDbKeyCondition } from "../expression/key-condition/sim-dynamodb-key-condition.js";
import { SimDynamoDbGlobalSecondaryIndexes } from "../secondary-index/sim-dynamodb-global-secondary-indexes.js";
import { SimDynamoDbItemCollection } from "./sim-dynamodb-item-collection.js";
import { SimDynamoDbItemKey } from "./sim-dynamodb-item-key.js";
import { describeSimDynamoDbTable } from "./sim-dynamodb-table-description.js";
import { SimDynamoDbTableItems } from "./sim-dynamodb-table-items.js";
import { SimDynamoDbTableLifecycle } from "./sim-dynamodb-table-lifecycle.js";
import { SimDynamoDbTableScan } from "./sim-dynamodb-table-scan.js";
import { SimDynamoDbTableTags } from "./sim-dynamodb-table-tags.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import type { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTableName,
} from "./sim-dynamodb-table-name.js";

interface SimDynamoDbTableProperties {
  readonly name: SimDynamoDbTableName;
  readonly arn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly billing: SimDynamoDbTableBilling;
  readonly indexes?: SimDynamoDbGlobalSecondaryIndexes;
  readonly tableClass?: SimDynamoDbTableClass | undefined;
  readonly deletionProtectionEnabled?: boolean | undefined;
  readonly tags?: SimDynamoDbTableTags;
  readonly background?: BackgroundScheduler;
}

/**
 * One simulated DynamoDB Table.
 *
 * A table is built from values a request has already been checked against,
 * rather than from the request itself, so anything that can produce those
 * values can make one. That is what lets CloudFormation create a table without
 * a CreateTable command to hand it.
 */
export class SimDynamoDbTable {
  public readonly creationDateTime: Date;
  public readonly tableName: DynamoDbTableName;
  public readonly arn: SimArn;
  public readonly tableId: string;
  public readonly keySchema: SimDynamoDbKeySchema;
  public readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  public readonly billing: SimDynamoDbTableBilling;

  /**
   * The global secondary indexes this table carries.
   *
   * Which items an index holds is worked out when it is read rather than kept
   * up to date on every write, so nothing here is more than what the index was
   * declared as.
   */
  public readonly indexes: SimDynamoDbGlobalSecondaryIndexes;

  public readonly tableClass: SimDynamoDbTableClass | undefined;
  public readonly deletionProtectionEnabled: boolean;

  /**
   * The tags this table carries.
   *
   * Tags are the table's own state rather than something a command holds, so
   * TagResource, UntagResource and ListTagsOfResource all work through this.
   */
  public readonly tags: SimDynamoDbTableTags;

  private readonly items = new SimDynamoDbTableItems();
  private readonly itemKey: SimDynamoDbItemKey;
  private readonly lifecycle: SimDynamoDbTableLifecycle;
  private readonly timeToLive: SimDynamoDbTimeToLive;
  private readonly expiry: SimDynamoDbTableExpiry;

  constructor(properties: SimDynamoDbTableProperties) {
    const {
      name,
      keySchema,
      attributeDefinitions,
      billing,
      indexes = SimDynamoDbGlobalSecondaryIndexes.none(),
      deletionProtectionEnabled = false,
      tags = SimDynamoDbTableTags.fromInput([]),
      background = new BackgroundTasks(),
    } = properties;

    this.tableName = name.value;
    this.arn = properties.arn;
    this.tableId = randomUUID();
    this.keySchema = keySchema;
    this.attributeDefinitions = attributeDefinitions;
    this.billing = billing;
    this.indexes = indexes;
    this.tableClass = properties.tableClass;
    this.deletionProtectionEnabled = deletionProtectionEnabled;
    this.tags = tags;
    this.itemKey = new SimDynamoDbItemKey(keySchema, attributeDefinitions);
    this.lifecycle = new SimDynamoDbTableLifecycle({
      tableName: name.value,
      deletionProtectionEnabled,
    });
    this.timeToLive = new SimDynamoDbTimeToLive(name.value);
    this.expiry = new SimDynamoDbTableExpiry({
      items: this.items,
      timeToLive: this.timeToLive,
      background,
    });
    this.creationDateTime = background.now();
  }

  /**
   * Get the current table status.
   */
  public get status(): SimDynamoDbTableStatus {
    return this.lifecycle.status;
  }

  /**
   * Simulate the table entering ACTIVE status.
   */
  activate(): Promise<void> {
    this.lifecycle.activate();
    return Promise.resolve();
  }

  /**
   * Refuse a delete this table is not in a state to take.
   */
  assertDeletable(): void {
    this.lifecycle.assertDeletable();
  }

  /**
   * Simulate the table entering DELETING status.
   *
   * The table is still there to describe while it is deleting, as it is on
   * AWS. What removes it is the background task the delete schedules.
   */
  beginDeletion(): void {
    this.lifecycle.beginDeletion();
  }

  /**
   * Describe this table the way DynamoDB reports it.
   */
  toDescription(): SimDynamoDbTableDescription {
    return describeSimDynamoDbTable(this);
  }

  /**
   * Put an item into the table, and answer with whatever it replaced.
   *
   * The item is there by the time this returns. Real DynamoDB acknowledges a
   * write once it is durable, so a read that follows it finds it.
   */
  public putItem(item: SimDynamoDbItem): SimDynamoDbItem | undefined {
    const key = this.itemKey.of(item);

    // An item need not carry an index's key attributes, since a global
    // secondary index is sparse. Carrying one as a type the index did not
    // declare is refused, since the index could never hold it.
    this.indexes.assertItemKeyTypes(item, this.attributeDefinitions);

    const replaced = this.items.put(key, item);

    this.expiry.scheduleFor(key, item);

    return replaced;
  }

  /**
   * Take an UpdateTimeToLive on this table.
   *
   * Switching it on reaches the items already there as well as the ones written
   * afterwards, since their TTL attributes were only inert while it was off.
   */
  updateTimeToLive(
    specification: SimDynamoDbTimeToLiveSpecification,
    at: Date,
  ): void {
    this.timeToLive.update(specification, at);
    this.expiry.scheduleForAll();
  }

  /**
   * Finish an UpdateTimeToLive, moving it off ENABLING or DISABLING.
   */
  settleTimeToLive(): Promise<void> {
    this.timeToLive.settle();

    return Promise.resolve();
  }

  /**
   * Describe this table's time to live the way DynamoDB reports it.
   */
  timeToLiveDescription(): SimDynamoDbTimeToLiveDescription {
    return this.timeToLive.description();
  }

  /**
   * The item already stored under the same primary key as this one.
   *
   * A conditional write is checked against what is there before it, and what is
   * there is found by the key inside the item rather than by a Key of its own.
   * The key is read the same way a write reads it, so an item that could not be
   * written does not quietly find nothing here either.
   */
  public itemUnder(item: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.items.get(this.itemKey.of(item));
  }

  /**
   * The primary key an item is stored under, as this table marshals it.
   *
   * A batch write tells two operations on the same item apart by comparing
   * these, which is why the key is readable rather than only usable. Reading it
   * checks the item against the key schema, so a key a write would refuse is
   * refused here too.
   */
  public keyOfItem(item: SimDynamoDbItem): string {
    return this.itemKey.of(item);
  }

  /**
   * The primary key a request's Key names, as this table marshals it.
   */
  public keyOfKey(key: SimDynamoDbItem): string {
    return this.itemKey.ofKey(key);
  }

  /**
   * Read the item a primary key names, if the table holds one.
   *
   * Every write has landed by the time it returns, so this reads the latest
   * one. That is what real DynamoDB gives a strongly consistent read.
   */
  public getItem(key: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.items.get(this.itemKey.ofKey(key));
  }

  /**
   * Remove the item a primary key names, and answer with whatever was removed.
   */
  public deleteItem(key: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.items.remove(this.itemKey.ofKey(key));
  }

  /**
   * The items a key condition names, in sort key order.
   *
   * A Query reads a whole item collection rather than one key, so the items are
   * reachable together as well as one at a time. The ordering belongs to the
   * collection rather than to the command that reads it.
   */
  public itemCollection(
    keyCondition: SimDynamoDbKeyCondition,
  ): SimDynamoDbItemCollection {
    return new SimDynamoDbItemCollection({
      items: this.items.entries().values(),
      keySchema: this.keySchema,
      keyCondition,
    });
  }

  /**
   * Every item this table holds, in the order a Scan reads them.
   *
   * A Scan needs no key knowledge, so unlike an item collection this is the
   * whole table. The order and the parallel scan segments both belong to the
   * scan rather than to the command that reads it.
   */
  public scan(): SimDynamoDbTableScan {
    return new SimDynamoDbTableScan({
      items: this.items.entries().values(),
      keySchema: this.keySchema,
      itemKey: this.itemKey,
    });
  }
}

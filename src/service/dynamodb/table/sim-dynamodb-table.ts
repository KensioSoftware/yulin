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
import type { SimDynamoDbTableTimeToLive } from "../time-to-live/sim-dynamodb-table-time-to-live.js";
import { SimDynamoDbSecondaryIndexes } from "../secondary-index/sim-dynamodb-secondary-indexes.js";
import type { SimDynamoDbReadView } from "./sim-dynamodb-read-view.js";
import { describeSimDynamoDbTable } from "./sim-dynamodb-table-description.js";
import { SimDynamoDbTableDefinition } from "./sim-dynamodb-table-definition.js";
import { SimDynamoDbTableLifecycle } from "./sim-dynamodb-table-lifecycle.js";
import { SimDynamoDbTableStorage } from "./sim-dynamodb-table-storage.js";
import { SimDynamoDbTableTags } from "./sim-dynamodb-table-tags.js";
import type { SimDynamoDbTableWrites } from "./sim-dynamodb-table-writes.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import type { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import type { SimDynamoDbTableUpdate } from "./sim-dynamodb-table-update.js";
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
  readonly indexes?: SimDynamoDbSecondaryIndexes;
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

  /**
   * The secondary indexes this table carries, global and local.
   *
   * Which items an index holds is worked out when it is read rather than kept
   * up to date on every write, so nothing here is more than what the index was
   * declared as.
   */
  public readonly indexes: SimDynamoDbSecondaryIndexes;

  /**
   * The tags this table carries.
   *
   * Tags are the table's own state rather than something a command holds, so
   * TagResource, UntagResource and ListTagsOfResource all work through this.
   */
  public readonly tags: SimDynamoDbTableTags;

  private readonly definition: SimDynamoDbTableDefinition;
  private readonly lifecycle: SimDynamoDbTableLifecycle;
  private readonly storage: SimDynamoDbTableStorage;

  constructor(properties: SimDynamoDbTableProperties) {
    const {
      name,
      keySchema,
      attributeDefinitions,
      billing,
      indexes = SimDynamoDbSecondaryIndexes.none(),
      deletionProtectionEnabled = false,
      tags = SimDynamoDbTableTags.fromInput([]),
      background = new BackgroundTasks(),
    } = properties;

    this.tableName = name.value;
    this.arn = properties.arn;
    this.tableId = randomUUID();
    this.keySchema = keySchema;
    this.indexes = indexes;
    this.tags = tags;
    this.definition = new SimDynamoDbTableDefinition({
      keySchema,
      attributeDefinitions,
      billing,
      tableClass: properties.tableClass,
    });
    this.lifecycle = new SimDynamoDbTableLifecycle({
      tableName: name.value,
      deletionProtectionEnabled,
    });
    this.storage = new SimDynamoDbTableStorage({
      tableName: name.value,
      definition: this.definition,
      indexes: this.indexes,
      background,
    });
    this.creationDateTime = background.now();
  }

  /** Get the current table status. */
  public get status(): SimDynamoDbTableStatus {
    return this.lifecycle.status;
  }

  /** The attributes this table's keys are made of. */
  public get attributeDefinitions(): SimDynamoDbAttributeDefinitions {
    return this.definition.attributeDefinitions;
  }

  /** How this table is billed, and what it is provisioned for. */
  public get billing(): SimDynamoDbTableBilling {
    return this.definition.billing;
  }

  /** The class this table is stored under, when it was given one. */
  public get tableClass(): SimDynamoDbTableClass | undefined {
    return this.definition.tableClass;
  }

  /** Whether this table is protected from deletion. */
  public get deletionProtectionEnabled(): boolean {
    return this.lifecycle.deletionProtectionEnabled;
  }

  /** This table's time to live, and the item removals it drives. */
  public get timeToLive(): SimDynamoDbTableTimeToLive {
    return this.storage.timeToLive;
  }

  /** How this table takes a write, as a check and then a commit. */
  public get writes(): SimDynamoDbTableWrites {
    return this.storage.writes;
  }

  /**
   * Simulate the table entering ACTIVE status, with its indexes.
   *
   * An index added by UpdateTable has no backfill to run here: which items an
   * index holds is worked out when it is read, so the CREATING window is a
   * status the scheduler advances rather than work being done. The index
   * answers for the items already on the table the moment it goes ACTIVE,
   * which is what AWS gets to by copying them into it.
   */
  activate(): Promise<void> {
    this.lifecycle.activate();
    this.indexes.global.activate();

    return Promise.resolve();
  }

  /** Refuse an update this table is not in a state to take. */
  assertUpdatable(): void {
    this.lifecycle.assertUpdatable();
  }

  /**
   * Apply a change UpdateTable has already checked against this table.
   *
   * Nothing here refuses anything. Everything the request asked for was read
   * and checked against the table as it stood, so by this point the change
   * either applies whole or was never built.
   */
  applyUpdate(update: SimDynamoDbTableUpdate): void {
    this.definition.apply(update);
    this.indexes.global.applyUpdate(update);
    this.lifecycle.applyUpdate(update);
  }

  /** Refuse a delete this table is not in a state to take. */
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

  /** Describe this table the way DynamoDB reports it. */
  toDescription(): SimDynamoDbTableDescription {
    return describeSimDynamoDbTable(this);
  }

  /** Put an item into the table, and answer with whatever it replaced. */
  public putItem(item: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.storage.putItem(item);
  }

  /** The item already stored under the same primary key as this one. */
  public itemUnder(item: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.storage.itemUnder(item);
  }

  /** The primary key an item is stored under, as this table marshals it. */
  public keyOfItem(item: SimDynamoDbItem): string {
    return this.storage.keyOfItem(item);
  }

  /** The primary key a request's Key names, as this table marshals it. */
  public keyOfKey(key: SimDynamoDbItem): string {
    return this.storage.keyOfKey(key);
  }

  /** Read the item a primary key names, if the table holds one. */
  public getItem(key: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.storage.getItem(key);
  }

  /** Remove the item a primary key names, and what was removed with it. */
  public deleteItem(key: SimDynamoDbItem): SimDynamoDbItem | undefined {
    return this.storage.deleteItem(key);
  }

  /** What a Query or a Scan reads: this table, or one of its indexes. */
  public view(indexName: string | undefined): SimDynamoDbReadView {
    return this.storage.view(indexName);
  }
}

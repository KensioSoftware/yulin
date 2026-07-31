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
import type { DynamoDbItem } from "../item/dynamodb-item.js";
import { describeSimDynamoDbTable } from "./sim-dynamodb-table-description.js";
import { SimDynamoDbTableItems } from "./sim-dynamodb-table-items.js";
import { SimDynamoDbTableLifecycle } from "./sim-dynamodb-table-lifecycle.js";
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
  readonly tableClass?: SimDynamoDbTableClass | undefined;
  readonly deletionProtectionEnabled?: boolean | undefined;
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
  public readonly tableClass: SimDynamoDbTableClass | undefined;
  public readonly deletionProtectionEnabled: boolean;

  private readonly items: SimDynamoDbTableItems;
  private readonly lifecycle: SimDynamoDbTableLifecycle;

  constructor(properties: SimDynamoDbTableProperties) {
    const {
      name,
      keySchema,
      attributeDefinitions,
      billing,
      deletionProtectionEnabled = false,
      background = new BackgroundTasks(),
    } = properties;

    this.tableName = name.value;
    this.arn = properties.arn;
    this.tableId = randomUUID();
    this.keySchema = keySchema;
    this.attributeDefinitions = attributeDefinitions;
    this.billing = billing;
    this.tableClass = properties.tableClass;
    this.deletionProtectionEnabled = deletionProtectionEnabled;
    this.items = new SimDynamoDbTableItems(background);
    this.lifecycle = new SimDynamoDbTableLifecycle({
      tableName: name.value,
      deletionProtectionEnabled,
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
   * Put an item into the table.
   */
  public putItem(item: DynamoDbItem): Promise<void> {
    this.items.put(this.keySchema.makeItemKey(item), item);
    return Promise.resolve();
  }
}

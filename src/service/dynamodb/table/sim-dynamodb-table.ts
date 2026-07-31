import { randomUUID } from "node:crypto";
import type { SimArn } from "../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../util/background/background.js";
import type {
  SimDynamoDbTableClass,
  SimDynamoDbTableClassSummary,
  SimDynamoDbTableDescription,
  SimDynamoDbTableStatus,
} from "../command/table/table.command.js";
import type { DynamoDbItem } from "../item/dynamodb-item.js";
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

  private readonly background: BackgroundScheduler;
  private readonly items = new Map<string, DynamoDbItem>();
  #status: SimDynamoDbTableStatus = "CREATING";

  constructor(properties: SimDynamoDbTableProperties) {
    const {
      name,
      arn,
      keySchema,
      attributeDefinitions,
      billing,
      tableClass,
      deletionProtectionEnabled = false,
      background = new BackgroundTasks(),
    } = properties;

    this.tableName = name.value;
    this.arn = arn;
    this.tableId = randomUUID();
    this.keySchema = keySchema;
    this.attributeDefinitions = attributeDefinitions;
    this.billing = billing;
    this.tableClass = tableClass;
    this.deletionProtectionEnabled = deletionProtectionEnabled;
    this.background = background;
    this.creationDateTime = background.now();
  }

  /**
   * Get the current table status.
   */
  public get status(): SimDynamoDbTableStatus {
    return this.#status;
  }

  /**
   * Simulate the table entering ACTIVE status.
   */
  activate(): Promise<void> {
    this.#status = "ACTIVE";
    return Promise.resolve();
  }

  /**
   * Describe this table the way DynamoDB reports it.
   */
  toDescription(): SimDynamoDbTableDescription {
    return {
      TableName: this.tableName,
      TableArn: this.arn,
      TableId: this.tableId,
      KeySchema: this.keySchema.elements,
      AttributeDefinitions: this.attributeDefinitions.elements,
      TableStatus: this.#status,
      CreationDateTime: this.creationDateTime,
      BillingModeSummary: this.billing.summary(),
      ProvisionedThroughput: this.billing.throughputDescription(),
      TableClassSummary: this.tableClassSummary(),
      DeletionProtectionEnabled: this.deletionProtectionEnabled,
      // Neither figure is tracked yet. Real DynamoDB updates both about every
      // six hours, so they lag behind the items anyway.
      ItemCount: 0,
      TableSizeBytes: 0,
    };
  }

  /**
   * Put an item into the table.
   */
  public putItem(item: DynamoDbItem): Promise<void> {
    const keyString = this.keySchema.makeItemKey(item);
    this.background.schedule(() => {
      this.items.set(keyString, item);
      return Promise.resolve();
    });
    return Promise.resolve();
  }

  /**
   * How the table reports its class, when the request that made it named one.
   */
  private tableClassSummary(): SimDynamoDbTableClassSummary | undefined {
    if (this.tableClass === undefined) {
      return undefined;
    }

    return { TableClass: this.tableClass };
  }
}

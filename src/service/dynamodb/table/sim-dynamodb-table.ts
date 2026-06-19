import type { Brand } from "../../../util/brand.type.js";
import {
  makeSimArn,
  type SimArn,
  type SimArnComponents,
} from "../../aws/arn.js";
import type { DynamoDbKeySchema } from "./dynamodb-key-schema.js";
import type { DynamoDbItem } from "../item/dynamodb-item.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../util/background/background.js";
import type {
  SimCreateTableCommand,
  SimDynamoDbTableStatus,
} from "../command/create-table/create-table.cmd.js";
import { DynamoDbTableCreateInput } from "./dynamodb-table-create-input.js";

export type DynamoDbTableName = Brand<string, "DynamoDbTableName">;

interface SimDynamoDbTableProps {
  readonly createCommand: SimCreateTableCommand;
  readonly arn?: SimArn;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated DynamoDB Table.
 */
export class SimDynamoDbTable {
  public readonly creationDateTime: Date;

  public readonly tableName: DynamoDbTableName;
  public readonly arn: SimArn;

  private readonly background: BackgroundScheduler;
  private readonly _keySchema: DynamoDbKeySchema;
  private _status: SimDynamoDbTableStatus = "CREATING";

  private readonly items = new Map<string, DynamoDbItem>();

  constructor(props: SimDynamoDbTableProps) {
    const {
      createCommand,
      arn = makeSimDynamoDbTableArn(),
      background = new BackgroundTasks(),
    } = props;
    const createInput = new DynamoDbTableCreateInput(createCommand);

    this.arn = arn;
    this.background = background;

    this.tableName = createInput.tableName();
    this.creationDateTime = new Date();
    this._keySchema = createInput.keySchema();
  }

  /**
   * Simulate the table entering ACTIVE status.
   */
  activate(): Promise<void> {
    this._status = "ACTIVE";
    return Promise.resolve();
  }

  /**
   * Get the current table status.
   */
  public get status(): SimDynamoDbTableStatus {
    return this._status;
  }

  /**
   * Put an item into the table.
   */
  public putItem(item: DynamoDbItem): Promise<void> {
    const keyString = this._keySchema.makeItemKey(item);
    this.background.schedule(() => {
      this.items.set(keyString, item);
      return Promise.resolve();
    });
    return Promise.resolve();
  }
}

/**
 * Generate a fake simulated DynamoDB Table ARN.
 */
export function makeSimDynamoDbTableArn(
  overrides?: Exclude<Partial<SimArnComponents>, "service" | "resourceType">,
): SimArn {
  return makeSimArn({
    service: "dynamodb",
    resourceType: "table",
    ...overrides,
  });
}

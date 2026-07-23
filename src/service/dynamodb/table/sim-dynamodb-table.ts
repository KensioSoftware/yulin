import type { Brand } from "../../../util/brand.type.js";
import {
  makeSimArn,
  type SimArn,
  type SimArnComponents,
} from "../../aws/arn.js";
import type { DynamoDbKeySchema as DynamoDatabaseKeySchema } from "./dynamodb-key-schema.js";
import type { DynamoDbItem as DynamoDatabaseItem } from "../item/dynamodb-item.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../util/background/background.js";
import type {
  SimCreateTableCommand,
  SimDynamoDbTableStatus as SimDynamoDatabaseTableStatus,
} from "../command/create-table/create-table.cmd.js";
import { DynamoDbTableCreateInput as DynamoDatabaseTableCreateInput } from "./dynamodb-table-create-input.js";

export type DynamoDbTableName = Brand<string, "DynamoDbTableName">;

interface SimDynamoDatabaseTableProperties {
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
  readonly #keySchema: DynamoDatabaseKeySchema;
  #status: SimDynamoDatabaseTableStatus = "CREATING";

  private readonly items = new Map<string, DynamoDatabaseItem>();

  constructor(properties: SimDynamoDatabaseTableProperties) {
    const {
      createCommand,
      arn = makeSimDynamoDbTableArn(),
      background = new BackgroundTasks(),
    } = properties;
    const createInput = new DynamoDatabaseTableCreateInput(createCommand);

    this.arn = arn;
    this.background = background;

    this.tableName = createInput.tableName();
    this.creationDateTime = new Date();
    this.#keySchema = createInput.keySchema();
  }

  /**
   * Simulate the table entering ACTIVE status.
   */
  activate(): Promise<void> {
    this.#status = "ACTIVE";
    return Promise.resolve();
  }

  /**
   * Get the current table status.
   */
  public get status(): SimDynamoDatabaseTableStatus {
    return this.#status;
  }

  /**
   * Put an item into the table.
   */
  public putItem(item: DynamoDatabaseItem): Promise<void> {
    const keyString = this.#keySchema.makeItemKey(item);
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

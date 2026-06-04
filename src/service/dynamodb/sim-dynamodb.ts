import type {
  CreateTableCommand,
  CreateTableOutput,
  DescribeTableCommand,
  DescribeTableOutput,
  ListTablesCommand,
  ListTablesOutput,
  PutItemCommand,
  PutItemCommandOutput,
} from "@aws-sdk/client-dynamodb";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "./table/dynamodb-table.js";
import { CreateTableCommandHandler } from "./command/create-table/create-table.handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { ListTablesCommandHandler } from "./command/list-tables/list-tables.handler.js";
import { DescribeTableCommandHandler } from "./command/describe-table/describe-table.handler.js";
import { PutItemCommandHandler } from "./command/put-item/put-item.handler.js";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../aws/sim-aws-account-region-scope.js";

/**
 * Simulated DynamoDB. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimDynamoDb {
  private readonly tables = new Map<DynamoDbTableName, SimDynamoDbTable>();

  constructor(
    private readonly accountRegionScope: SimAwsAccountRegionScope = simAwsAccountRegionScopeFactory.make(),
    private readonly background: BackgroundScheduler = new BackgroundTasks(),
  ) {}

  /**
   * Handle a Create Table Command from the SDK.
   */
  async createTable(cmd: CreateTableCommand): Promise<CreateTableOutput> {
    const handler = new CreateTableCommandHandler(
      this.accountRegionScope,
      this.tables,
      this.background,
    );
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Tables Command from the SDK.
   */
  async listTables(cmd: ListTablesCommand): Promise<ListTablesOutput> {
    const handler = new ListTablesCommandHandler(this.tables);
    return await handler.handle(cmd);
  }

  /**
   * Handle a Describe Table Command from the SDK.
   */
  async describeTable(cmd: DescribeTableCommand): Promise<DescribeTableOutput> {
    const handler = new DescribeTableCommandHandler(this.tables);
    return await handler.handle(cmd);
  }

  /**
   * Handle a Put Item Command from the SDK.
   */
  async putItem(cmd: PutItemCommand): Promise<PutItemCommandOutput> {
    const handler = new PutItemCommandHandler(this.tables);
    return await handler.handle(cmd);
  }
}

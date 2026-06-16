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
import type {
  SimCreateTableCommand,
  SimCreateTableCommandOutput,
} from "./command/create-table/create-table.cmd.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandOutput,
} from "./command/put-item/put-item.cmd.js";
import type {
  SimListTablesCommand,
  SimListTablesCommandOutput,
} from "./command/list-tables/list-tables.cmd.js";
import type {
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
} from "./command/describe-table/describe-table.cmd.js";

interface SimDynamoDbProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated DynamoDB. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimDynamoDb {
  private readonly tables = new Map<DynamoDbTableName, SimDynamoDbTable>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;

  constructor(props: SimDynamoDbProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.background = background;
  }

  /**
   * Handle a Create Table Command from the SDK.
   */
  async createTable(
    cmd: SimCreateTableCommand,
  ): Promise<SimCreateTableCommandOutput> {
    const handler = new CreateTableCommandHandler({
      accountRegionScope: this.accountRegionScope,
      tables: this.tables,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Tables Command from the SDK.
   */
  async listTables(
    cmd: SimListTablesCommand,
  ): Promise<SimListTablesCommandOutput> {
    const handler = new ListTablesCommandHandler({
      tables: this.tables,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Describe Table Command from the SDK.
   */
  async describeTable(
    cmd: SimDescribeTableCommand,
  ): Promise<SimDescribeTableCommandOutput> {
    const handler = new DescribeTableCommandHandler({
      tables: this.tables,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Put Item Command from the SDK.
   */
  async putItem(cmd: SimPutItemCommand): Promise<SimPutItemCommandOutput> {
    const handler = new PutItemCommandHandler({ tables: this.tables });
    return await handler.handle(cmd);
  }
}

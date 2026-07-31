import type { SimDynamoDbTable } from "./table/sim-dynamodb-table.js";
import type { DynamoDbTableName } from "./table/sim-dynamodb-table-name.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { ListTablesCommandHandler } from "./command/list-tables/list-tables.handler.js";
import { DescribeTableCommandHandler } from "./command/describe-table/describe-table.handler.js";
import { PutItemCommandHandler } from "./command/put-item/put-item.handler.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbAuthorizer } from "./command/authorize/sim-dynamodb-authorizer.js";
import { SimDynamoDbCreateTable } from "./command/table/sim-dynamodb-create-table.js";
import type {
  SimCreateTableCommand,
  SimCreateTableCommandOutput,
} from "./command/table/table.command.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandOutput,
} from "./command/put-item/put-item.command.js";
import type {
  SimListTablesCommand,
  SimListTablesCommandOutput,
} from "./command/list-tables/list-tables.command.js";
import type {
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
} from "./command/describe-table/describe-table.command.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimDynamoDatabaseSdkCommandRouter } from "./sdk/sim-dynamodb-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";

export interface SimDynamoDbRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimDynamoDatabaseProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated DynamoDB. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimDynamoDb {
  private readonly tables = new Map<DynamoDbTableName, SimDynamoDbTable>();

  private readonly authorizer: SimDynamoDbAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly tableCreation: SimDynamoDbCreateTable;
  private readonly sdkRouter = new SimDynamoDatabaseSdkCommandRouter(this);

  constructor(properties: SimDynamoDatabaseProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.background = background;
    this.authorizer = new SimDynamoDbAuthorizer({ iam, accountRegionScope });
    this.tableCreation = new SimDynamoDbCreateTable({
      tables: this.tables,
      authorizer: this.authorizer,
      accountRegionScope,
      background,
    });
  }

  /**
   * Handle a Create Table Command from the SDK.
   */
  async createTable(
    command: SimCreateTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimCreateTableCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();
    return this.tableCreation.handle(command, options);
  }

  /**
   * Handle a List Tables Command from the SDK.
   */
  async listTables(
    command: SimListTablesCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimListTablesCommandOutput> {
    const handler = new ListTablesCommandHandler({
      tables: this.tables,
      authorizer: this.authorizer,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a Describe Table Command from the SDK.
   */
  async describeTable(
    command: SimDescribeTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimDescribeTableCommandOutput> {
    const handler = new DescribeTableCommandHandler({
      tables: this.tables,
      authorizer: this.authorizer,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a Put Item Command from the SDK.
   */
  async putItem(
    command: SimPutItemCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimPutItemCommandOutput> {
    const handler = new PutItemCommandHandler({
      tables: this.tables,
      authorizer: this.authorizer,
    });
    return await handler.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

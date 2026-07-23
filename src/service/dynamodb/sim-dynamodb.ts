import type {
  DynamoDbTableName as DynamoDatabaseTableName,
  SimDynamoDbTable as SimDynamoDatabaseTable,
} from "./table/sim-dynamodb-table.js";
import { CreateTableCommandHandler } from "./command/create-table/create-table.handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { ListTablesCommandHandler } from "./command/list-tables/list-tables.handler.js";
import { DescribeTableCommandHandler } from "./command/describe-table/describe-table.handler.js";
import { PutItemCommandHandler } from "./command/put-item/put-item.handler.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
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
  private readonly tables = new Map<
    DynamoDatabaseTableName,
    SimDynamoDatabaseTable
  >();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimDynamoDatabaseSdkCommandRouter(this);

  constructor(properties: SimDynamoDatabaseProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.iam = iam;
    this.background = background;
  }

  /**
   * Handle a Create Table Command from the SDK.
   */
  async createTable(
    command: SimCreateTableCommand,
    options?: SimDynamoDbRequestOptions,
  ): Promise<SimCreateTableCommandOutput> {
    const handler = new CreateTableCommandHandler({
      accountRegionScope: this.accountRegionScope,
      tables: this.tables,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
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
      iam: this.iam,
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
      accountRegionScope: this.accountRegionScope,
      tables: this.tables,
      iam: this.iam,
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
      accountRegionScope: this.accountRegionScope,
      tables: this.tables,
      iam: this.iam,
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

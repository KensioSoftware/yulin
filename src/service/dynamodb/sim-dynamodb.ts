import type {
  DynamoDbTableName,
  SimDynamoDbTable,
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

export interface SimDynamoDbRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimDynamoDbProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated DynamoDB. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimDynamoDb {
  private readonly tables = new Map<DynamoDbTableName, SimDynamoDbTable>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;

  constructor(props: SimDynamoDbProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.iam = iam;
    this.background = background;
  }

  /**
   * Handle a Create Table Command from the SDK.
   */
  async createTable(
    cmd: SimCreateTableCommand,
    opts?: SimDynamoDbRequestOptions,
  ): Promise<SimCreateTableCommandOutput> {
    const handler = new CreateTableCommandHandler({
      accountRegionScope: this.accountRegionScope,
      tables: this.tables,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(cmd, opts);
  }

  /**
   * Handle a List Tables Command from the SDK.
   */
  async listTables(
    cmd: SimListTablesCommand,
    opts?: SimDynamoDbRequestOptions,
  ): Promise<SimListTablesCommandOutput> {
    const handler = new ListTablesCommandHandler({
      tables: this.tables,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(cmd, opts);
  }

  /**
   * Handle a Describe Table Command from the SDK.
   */
  async describeTable(
    cmd: SimDescribeTableCommand,
    opts?: SimDynamoDbRequestOptions,
  ): Promise<SimDescribeTableCommandOutput> {
    const handler = new DescribeTableCommandHandler({
      accountRegionScope: this.accountRegionScope,
      tables: this.tables,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(cmd, opts);
  }

  /**
   * Handle a Put Item Command from the SDK.
   */
  async putItem(cmd: SimPutItemCommand): Promise<SimPutItemCommandOutput> {
    const handler = new PutItemCommandHandler({ tables: this.tables });
    return await handler.handle(cmd);
  }
}

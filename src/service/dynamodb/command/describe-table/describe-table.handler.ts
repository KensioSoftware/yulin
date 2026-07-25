import type {
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
} from "./describe-table.command.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  DynamoDbTableName as DynamoDatabaseTableName,
  SimDynamoDbTable as SimDynamoDatabaseTable,
} from "../../table/sim-dynamodb-table.js";
import { SimDynamoDbResourceNotFoundException as SimDynamoDatabaseResourceNotFoundException } from "../../error/dynamodb.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { DescribeTableAuthorizer } from "./describe-table-authorizer.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimArn } from "../../../aws/arn.js";

interface DescribeTableCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DescribeTableCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * DynamoDB DescribeTableCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/DescribeTableCommand/
 */
export class DescribeTableCommandHandler implements CommandHandler<
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
  private readonly authorizer: DescribeTableAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DescribeTableCommandHandlerProperties) {
    const {
      accountRegionScope,
      tables,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.accountRegionScope = accountRegionScope;
    this.tables = tables;
    this.authorizer = new DescribeTableAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Simulate describing DynamoDB Table.
   */
  async handle(
    command: SimDescribeTableCommand,
    options?: DescribeTableCommandHandlerOptions,
  ): Promise<SimDescribeTableCommandOutput> {
    assertDefined(
      command.input.TableName,
      "DescribeTableCommand.input.TableName",
    );
    const tableName = command.input.TableName as DynamoDatabaseTableName;

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const tableArn: SimArn = `arn:aws:dynamodb:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:table/${tableName}`;

    this.authorizer.authorize(tableArn, options?.caller);

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new SimDynamoDatabaseResourceNotFoundException(
        `No DynamoDB Table named ${tableName}`,
      );
    }

    return {
      Table: {
        TableName: table.tableName,
        TableStatus: table.status,
      },
      $metadata: {},
    };
  }
}

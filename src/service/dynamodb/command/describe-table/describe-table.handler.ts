import type {
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
} from "./describe-table.cmd.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../table/sim-dynamodb-table.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
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

interface DescribeTableCommandHandlerProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
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
  private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
  private readonly authorizer: DescribeTableAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(props: DescribeTableCommandHandlerProps) {
    const {
      accountRegionScope,
      tables,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;
    this.accountRegionScope = accountRegionScope;
    this.tables = tables;
    this.authorizer = new DescribeTableAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Simulate describing DynamoDB Table.
   */
  async handle(
    cmd: SimDescribeTableCommand,
    opts?: DescribeTableCommandHandlerOptions,
  ): Promise<SimDescribeTableCommandOutput> {
    assertDefined(cmd.input.TableName, "DescribeTableCommand.input.TableName");
    const tableName = cmd.input.TableName as DynamoDbTableName;

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const tableArn: SimArn = `arn:aws:dynamodb:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:table/${tableName}`;

    this.authorizer.authorize(tableArn, opts?.caller);

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new SimDynamoDbResourceNotFoundException(
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

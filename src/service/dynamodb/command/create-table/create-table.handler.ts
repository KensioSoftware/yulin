import type { DynamoDbTableName } from "../../table/dynamodb-table.js";
import { SimDynamoDbTable } from "../../table/dynamodb-table.js";
import {
  type CreateTableCommand,
  type CreateTableCommandOutput,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import { jitter } from "../../../../util/sleep.js";
import { assertDefined } from "../../../../util/defined.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import type { SimArn } from "../../../aws/arn.js";

/**
 * DynamoDB CreateTableCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/CreateTableCommand/
 */
export class CreateTableCommandHandler implements CommandHandler<
  CreateTableCommand,
  CreateTableCommandOutput
> {
  constructor(
    private readonly accountId: SimAwsAccountId,
    private readonly regionName: AwsRegionName,
    private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>,
    private readonly background: BackgroundScheduler,
  ) {}

  /**
   * Handle creation of a new DynamoDB Table.
   */
  async handle(cmd: CreateTableCommand): Promise<CreateTableCommandOutput> {
    assertDefined(cmd.input.TableName, "CreateTableCommand.input.TableName");

    const tableName = cmd.input.TableName as DynamoDbTableName;
    if (this.tables.has(tableName)) {
      throw new ResourceInUseException({
        message: `DynamoDB Table ${tableName} already exists`,
        $metadata: {},
      });
    }

    await jitter();

    const tableArn: SimArn = `arn:aws:dynamodb:${this.regionName}:${this.accountId}:table/${tableName}`;
    const table = new SimDynamoDbTable(cmd, tableArn, this.background);
    this.tables.set(tableName, table);

    this.background.schedule(() => table.activate());

    return {
      TableDescription: {
        AttributeDefinitions: [],
        TableName: table.tableName,
        TableArn: table.simArn,
        KeySchema: [],
        TableStatus: table.status,
        CreationDateTime: table.creationDateTime,
        GlobalSecondaryIndexes: [],
      },
      $metadata: {},
    };
  }
}

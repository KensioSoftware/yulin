import type { DynamoDbTableName } from "../../table/dynamodb-table.js";
import { SimDynamoDbTable } from "../../table/dynamodb-table.js";
import type {
  SimCreateTableCommand,
  SimCreateTableCommandOutput,
} from "./create-table.cmd.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import { jitter } from "../../../../util/sleep.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbResourceInUseException } from "../../error/dynamodb.error.js";

interface CreateTableCommandHandlerProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
  readonly background: BackgroundScheduler;
}

/**
 * DynamoDB CreateTableCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/CreateTableCommand/
 */
export class CreateTableCommandHandler implements CommandHandler<
  SimCreateTableCommand,
  SimCreateTableCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
  private readonly background: BackgroundScheduler;

  constructor(props: CreateTableCommandHandlerProps) {
    this.accountRegionScope = props.accountRegionScope;
    this.tables = props.tables;
    this.background = props.background;
  }

  /**
   * Handle creation of a new DynamoDB Table.
   */
  async handle(
    cmd: SimCreateTableCommand,
  ): Promise<SimCreateTableCommandOutput> {
    assertDefined(cmd.input.TableName, "CreateTableCommand.input.TableName");

    const tableName = cmd.input.TableName as DynamoDbTableName;
    if (this.tables.has(tableName)) {
      throw new SimDynamoDbResourceInUseException(
        `DynamoDB Table ${tableName} already exists`,
      );
    }

    await jitter();

    const tableArn: SimArn = `arn:aws:dynamodb:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:table/${tableName}`;
    const table = new SimDynamoDbTable({
      createCommand: cmd,
      arn: tableArn,
      background: this.background,
    });
    this.tables.set(tableName, table);

    this.background.schedule(() => table.activate());

    return {
      TableDescription: {
        AttributeDefinitions: [],
        TableName: table.tableName,
        TableArn: table.arn,
        KeySchema: [],
        TableStatus: table.status,
        CreationDateTime: table.creationDateTime,
        GlobalSecondaryIndexes: [],
      },
      $metadata: {},
    };
  }
}

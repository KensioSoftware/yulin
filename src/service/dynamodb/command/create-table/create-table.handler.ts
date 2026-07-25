import type { DynamoDbTableName as DynamoDatabaseTableName } from "../../table/sim-dynamodb-table.js";
import { SimDynamoDbTable as SimDynamoDatabaseTable } from "../../table/sim-dynamodb-table.js";
import type {
  SimCreateTableCommand,
  SimCreateTableCommandOutput,
} from "./create-table.command.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbResourceInUseException as SimDynamoDatabaseResourceInUseException } from "../../error/dynamodb.error.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { CreateTableAuthorizer } from "./create-table-authorizer.js";

interface CreateTableCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface CreateTableCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
  private readonly authorizer: CreateTableAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: CreateTableCommandHandlerProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.tables = properties.tables;
    this.authorizer = new CreateTableAuthorizer({
      iam: properties.iam ?? new SimIamAllowAllAuth(),
    });
    this.background = properties.background;
  }

  /**
   * Handle creation of a new DynamoDB Table.
   */
  async handle(
    command: SimCreateTableCommand,
    options?: CreateTableCommandHandlerOptions,
  ): Promise<SimCreateTableCommandOutput> {
    assertDefined(
      command.input.TableName,
      "CreateTableCommand.input.TableName required",
    );

    const tableName = command.input.TableName as DynamoDatabaseTableName;
    if (this.tables.has(tableName)) {
      throw new SimDynamoDatabaseResourceInUseException(
        `DynamoDB Table ${tableName} already exists`,
      );
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const tableArn: SimArn = `arn:aws:dynamodb:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:table/${tableName}`;

    this.authorizer.authorize(tableArn, options?.caller);

    const table = new SimDynamoDatabaseTable({
      tableCommand: command,
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

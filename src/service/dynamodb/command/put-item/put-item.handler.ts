import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandOutput,
} from "./put-item.command.js";
import type {
  DynamoDbTableName as DynamoDatabaseTableName,
  SimDynamoDbTable as SimDynamoDatabaseTable,
} from "../../table/sim-dynamodb-table.js";
import { DynamoDbItem as DynamoDatabaseItem } from "../../item/dynamodb-item.js";
import { SimDynamoDbResourceNotFoundException as SimDynamoDatabaseResourceNotFoundException } from "../../error/dynamodb.error.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { PutItemAuthorizer } from "./put-item-authorizer.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimArn } from "../../../aws/arn.js";

interface PutItemCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
  readonly iam?: SimIamInterServiceAuthZ;
}

interface PutItemCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * DynamoDB PutItemCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/PutItemCommand/
 */
export class PutItemCommandHandler implements CommandHandler<
  SimPutItemCommand,
  SimPutItemCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly tables: Map<DynamoDatabaseTableName, SimDynamoDatabaseTable>;
  private readonly authorizer: PutItemAuthorizer;

  constructor(properties: PutItemCommandHandlerProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.tables = properties.tables;
    this.authorizer = new PutItemAuthorizer({
      iam: properties.iam ?? new SimIamAllowAllAuth(),
    });
  }

  /**
   * Put an Item into a DynamoDB Table.
   */
  async handle(
    command: SimPutItemCommand,
    options?: PutItemCommandHandlerOptions,
  ): Promise<SimPutItemCommandOutput> {
    const tableName = command.input.TableName as
      DynamoDatabaseTableName | undefined;
    assertDefined(tableName, "PutItemCommand.input.TableName required");

    const tableArn: SimArn = `arn:aws:dynamodb:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:table/${tableName}`;

    this.authorizer.authorize(tableArn, options?.caller);

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new SimDynamoDatabaseResourceNotFoundException(
        `No DynamoDB Table named ${tableName}`,
      );
    }

    assertDefined(command.input.Item, "PutItemCommand.input.Item required");

    const item = DynamoDatabaseItem.fromAttributeValues(command.input.Item);

    await table.putItem(item);

    return {
      Attributes: item.toAttributeValues(),
      $metadata: {},
    };
  }
}

import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutItemCommand,
  SimPutItemCommandOutput,
} from "./put-item.cmd.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../table/sim-dynamodb-table.js";
import { DynamoDbItem } from "../../item/dynamodb-item.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { PutItemAuthorizer } from "./put-item-authorizer.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimArn } from "../../../aws/arn.js";

interface PutItemCommandHandlerProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
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
  private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
  private readonly authorizer: PutItemAuthorizer;

  constructor(props: PutItemCommandHandlerProps) {
    this.accountRegionScope = props.accountRegionScope;
    this.tables = props.tables;
    this.authorizer = new PutItemAuthorizer({
      iam: props.iam ?? new SimIamAllowAllAuth(),
    });
  }

  /**
   * Put an Item into a DynamoDB Table.
   */
  async handle(
    cmd: SimPutItemCommand,
    opts?: PutItemCommandHandlerOptions,
  ): Promise<SimPutItemCommandOutput> {
    const tableName = cmd.input.TableName as DynamoDbTableName | undefined;
    assertDefined(tableName, "PutItemCommand.input.TableName required");

    const tableArn: SimArn = `arn:aws:dynamodb:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:table/${tableName}`;

    this.authorizer.authorize(tableArn, opts?.caller);

    const table = this.tables.get(tableName);
    if (table === undefined) {
      throw new SimDynamoDbResourceNotFoundException(
        `No DynamoDB Table named ${tableName}`,
      );
    }

    assertDefined(cmd.input.Item, "PutItemCommand.input.Item required");

    const item = DynamoDbItem.fromAttributeValues(cmd.input.Item);

    await table.putItem(item);

    return {
      Attributes: item.toAttributeValues(),
      $metadata: {},
    };
  }
}

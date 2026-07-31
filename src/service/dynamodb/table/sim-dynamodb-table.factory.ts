import { MappedFactory } from "@kensio/part-factory";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import { SimDynamoDbTable } from "./sim-dynamodb-table.js";
import { simDynamoDbTableArn } from "./sim-dynamodb-table-arn.js";
import { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import { SimDynamoDbTableName } from "./sim-dynamodb-table-name.js";

/**
 * What a test asks for when it wants a table on its own.
 */
export interface SimDynamoDbTableInput {
  readonly tableName: string;
  readonly partitionKeyName: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Builds a table on its own, without a simulated DynamoDB service to hold it.
 *
 * A test that wants a table a simulated DynamoDB knows about calls CreateTable
 * instead, as an application would.
 */
export const simDynamoDbTableFactory = new MappedFactory<
  SimDynamoDbTableInput,
  SimDynamoDbTable
>(
  () => ({
    tableName: "FoobarTable",
    partitionKeyName: "id",
    accountRegionScope: {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    },
  }),
  (input) => {
    const name = SimDynamoDbTableName.of(input.tableName);

    return new SimDynamoDbTable({
      name,
      arn: simDynamoDbTableArn(input.accountRegionScope, name.value),
      keySchema: SimDynamoDbKeySchema.fromInput([
        { AttributeName: input.partitionKeyName, KeyType: "HASH" },
      ]),
      attributeDefinitions: SimDynamoDbAttributeDefinitions.fromInput([
        { AttributeName: input.partitionKeyName, AttributeType: "S" },
      ]),
      billing: SimDynamoDbTableBilling.fromInput({
        BillingMode: "PAY_PER_REQUEST",
      }),
    });
  },
);

import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "../../aws/sim-aws.js";
import { simCfnDynamoDbTableResourceFactory } from "./table/sim-cfn-dynamodb-table-resource.factory.js";

describe("DynamoDB CloudFormation Resource teardown", () => {
  it("deletes the table a Stack created", async () => {
    // Given a deployed table.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbTableResourceFactory.make({
            tableName: "orders",
            partitionKeyName: "customerId",
          }),
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // When the Stack's Resources are torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then DescribeTable no longer finds it.
    await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .describeTable(new DescribeTableCommand({ TableName: "orders" })),
    );
    assertIdentical(
      stack.getResource("OrdersTable")?.status,
      "DELETE_COMPLETE",
    );
  });
});

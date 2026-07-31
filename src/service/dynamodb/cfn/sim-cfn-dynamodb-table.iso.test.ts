import {
  DescribeTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertNonNullable,
  assertStringStartsWith,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

/**
 * A template holding one on-demand table with a partition and a sort key.
 */
const ordersTableTemplate = {
  Resources: {
    OrdersTable: {
      Type: "AWS::DynamoDB::Table",
      Properties: {
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      },
    },
  },
  Outputs: {
    OrdersTableName: { Value: { Ref: "OrdersTable" } },
  },
};

describe("DynamoDB CloudFormation Table deployment", () => {
  it("creates a table carrying the key schema and attribute definitions", async () => {
    // Given a template declaring a named table.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: {
            Type: "AWS::DynamoDB::Table",
            Properties: {
              TableName: "orders",
              KeySchema: [
                { AttributeName: "customerId", KeyType: "HASH" },
                { AttributeName: "orderId", KeyType: "RANGE" },
              ],
              AttributeDefinitions: [
                { AttributeName: "customerId", AttributeType: "S" },
                { AttributeName: "orderId", AttributeType: "S" },
              ],
              BillingMode: "PAY_PER_REQUEST",
              TableClass: "STANDARD_INFREQUENT_ACCESS",
              DeletionProtectionEnabled: true,
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();
    // The table becomes ACTIVE in the background, as it does for an SDK
    // caller's CreateTable.
    await simAws.backgroundTasksComplete();

    // Then DescribeTable finds it, described as an SDK caller's table is, so a
    // wrong value in the template is a wrong value in the test.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertNonNullable(described.Table.KeySchema);
    assertIdentical(described.Table.TableStatus, "ACTIVE");
    assertIdentical(
      described.Table.TableArn,
      "arn:aws:dynamodb:eu-west-2:111111111111:table/orders",
    );
    assertIdentical(
      described.Table.KeySchema.at(0)?.AttributeName,
      "customerId",
    );
    assertIdentical(described.Table.KeySchema.at(1)?.AttributeName, "orderId");
    assertIdentical(
      described.Table.AttributeDefinitions?.at(0)?.AttributeType,
      "S",
    );
    assertIdentical(
      described.Table.BillingModeSummary?.BillingMode,
      "PAY_PER_REQUEST",
    );
    assertIdentical(
      described.Table.TableClassSummary?.TableClass,
      "STANDARD_INFREQUENT_ACCESS",
    );
    assertTrue(described.Table.DeletionProtectionEnabled);
  });

  it("provisions a table with the throughput the template sets", async () => {
    // Given a template asking for provisioned capacity, as CDK emits for a
    // table with no billing mode of its own.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: {
            Type: "AWS::DynamoDB::Table",
            Properties: {
              TableName: "orders",
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [
                { AttributeName: "id", AttributeType: "S" },
              ],
              BillingMode: "PROVISIONED",
              ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 3,
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the capacity is reported back off the table.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table?.ProvisionedThroughput);
    assertIdentical(described.Table.ProvisionedThroughput.ReadCapacityUnits, 5);
    assertIdentical(
      described.Table.ProvisionedThroughput.WriteCapacityUnits,
      3,
    );
  });

  it("provisions capacity a template Parameter supplies as a string", async () => {
    // Given a template taking its read capacity from a Parameter, which
    // resolves to a string rather than the number a literal property carries.
    const simAws = simAwsInEuWest2();

    // When the template is deployed with a value for it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      parameters: { TableReadCapacity: "7" },
      template: {
        Parameters: { TableReadCapacity: { Type: "Number" } },
        Resources: {
          OrdersTable: {
            Type: "AWS::DynamoDB::Table",
            Properties: {
              TableName: "orders",
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [
                { AttributeName: "id", AttributeType: "S" },
              ],
              ProvisionedThroughput: {
                ReadCapacityUnits: { Ref: "TableReadCapacity" },
                WriteCapacityUnits: 1,
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table has the capacity the Parameter carried.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertIdentical(
      described.Table?.ProvisionedThroughput?.ReadCapacityUnits,
      7,
    );
  });

  it("resolves Ref to the table name and Fn::GetAtt Arn to the table ARN", async () => {
    // Given a template referencing its table both ways.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: {
            Type: "AWS::DynamoDB::Table",
            Properties: {
              TableName: "orders",
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [
                { AttributeName: "id", AttributeType: "S" },
              ],
              BillingMode: "PAY_PER_REQUEST",
            },
          },
        },
        Outputs: {
          TableRef: { Value: { Ref: "OrdersTable" } },
          TableArn: { Value: { "Fn::GetAtt": ["OrdersTable", "Arn"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then Ref is the table name, as AWS::DynamoDB::Table Ref is, so it can be
    // handed straight to PutItem.
    assertIdentical(stack.outputs.get("TableRef")?.value, "orders");
    assertIdentical(
      stack.outputs.get("TableArn")?.value,
      "arn:aws:dynamodb:eu-west-2:111111111111:table/orders",
    );
  });

  it("writes and reads an item through the table a Ref names", async () => {
    // Given a deployed table whose name the stack outputs.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTableTemplate,
    });
    await stack.waitForDeployComplete();

    const tableName = stack.outputs.get("OrdersTableName")?.value;
    assertTypeString(tableName);

    // When an item is written to the table the Ref named.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          customerId: { S: "customer-1" },
          orderId: { S: "order-1" },
          total: { N: "42.5" },
        },
      }),
    );

    // Then it reads back off the deployed table.
    const read = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: tableName,
        Key: { customerId: { S: "customer-1" }, orderId: { S: "order-1" } },
      }),
    );

    assertIdentical(read.Item?.["total"]?.N, "42.5");
  });

  it("names an unnamed table after the stack and its logical ID", async () => {
    // Given a template leaving TableName out, as CDK does for a table with no
    // explicit name.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTableTemplate,
    });
    await stack.waitForDeployComplete();

    // Then the name carries the stack name and the logical ID, so a Lambda
    // environment variable built from the Ref reaches the deployed table.
    assertIdentical(
      stack.outputs.get("OrdersTableName")?.value,
      "orders-stack-OrdersTable",
    );
    assertNonNullable(simAws.dynamoDb().findTable("orders-stack-OrdersTable"));
  });

  it("gives two stacks deploying one template two differently named tables", async () => {
    // Given one template with no TableName in it, deployed twice.
    const simAws = simAwsInEuWest2();

    // When both stacks are deployed.
    const first = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTableTemplate,
    });
    const second = await simAws.cloudFormation().deployTemplate({
      stackName: "returns-stack",
      template: ordersTableTemplate,
    });
    await first.waitForDeployComplete();
    await second.waitForDeployComplete();

    // Then the two tables have different names, because the stack name is part
    // of a generated one, so neither stack collides with the other.
    const firstName = first.outputs.get("OrdersTableName")?.value;
    const secondName = second.outputs.get("OrdersTableName")?.value;

    assertTypeString(firstName);
    assertTypeString(secondName);
    assertStringStartsWith(firstName, "orders-stack-");
    assertStringStartsWith(secondName, "returns-stack-");
    assertNonNullable(simAws.dynamoDb().findTable(firstName));
    assertNonNullable(simAws.dynamoDb().findTable(secondName));
  });

  it("creates the table in the Account and Region the stack deploys into", async () => {
    // Given a template deployed through a scoped simulated CloudFormation.
    const simAws = new SimAws();
    const scoped = simAws.account("222222222222").region("us-east-1");

    // When the template is deployed.
    const stack = await scoped.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: {
            Type: "AWS::DynamoDB::Table",
            Properties: {
              TableName: "orders",
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [
                { AttributeName: "id", AttributeType: "S" },
              ],
              BillingMode: "PAY_PER_REQUEST",
            },
          },
        },
        Outputs: {
          TableArn: { Value: { "Fn::GetAtt": ["OrdersTable", "Arn"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the table is in that scope, and the default scope has none.
    assertIdentical(
      stack.outputs.get("TableArn")?.value,
      "arn:aws:dynamodb:us-east-1:222222222222:table/orders",
    );
    assertNonNullable(scoped.dynamoDb().findTable("orders"));
    assertUndefined(simAws.dynamoDb().findTable("orders"));
  });
});

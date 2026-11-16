import {
  DescribeStacksCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  ListTagsOfResourceCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertNotEqual,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import {
  deployWithOrder,
  storedStatus,
  updateOrdersTable,
} from "./sim-cfn-dynamodb-table-update.test-support.js";
import { simCfnDynamoDbTableResourceFactory } from "./table/sim-cfn-dynamodb-table-resource.factory.js";

/**
 * The table the stack holds.
 */
function deployedTable(simAws: SimAws): SimDynamoDbTable {
  const table = simAws
    .cloudFormation()
    .getStackByName("orders-stack")
    ?.getResource("OrdersTable")?.simResource as SimDynamoDbTable | undefined;
  assertNonNullable(table);

  return table;
}

const statusIndex = {
  IndexName: "byStatus",
  KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
  Projection: { ProjectionType: "ALL" },
};

const statusAttributes = [
  { AttributeName: "orderId", AttributeType: "S" },
  { AttributeName: "status", AttributeType: "S" },
];

describe("DynamoDB CloudFormation Table update", () => {
  it("keeps the items across a change of billing mode", async () => {
    // Given a deployed on-demand table holding an order.
    const simAws = new SimAws();
    await deployWithOrder(simAws);
    const before = simAws.dynamoDb().findTable("orders");

    // When the stack is updated to provision capacity instead.
    await updateOrdersTable(simAws, {
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    });

    // Then the same table is provisioned and still holds the order.
    assertIdentical(simAws.dynamoDb().findTable("orders"), before);
    assertIdentical(await storedStatus(simAws), "open");

    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    assertIdentical(
      described.Table?.ProvisionedThroughput?.ReadCapacityUnits,
      5,
    );
  });

  it("adds a global secondary index that reads the items already there", async () => {
    // Given a deployed table holding an order.
    const simAws = new SimAws();
    await deployWithOrder(simAws);

    // When the stack is updated to add an index on the order's status.
    await updateOrdersTable(simAws, {
      AttributeDefinitions: statusAttributes,
      GlobalSecondaryIndexes: [statusIndex],
    });

    // Then the index finds the order put before it existed.
    const page = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "orders",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":open": { S: "open" } },
      }),
    );
    assertIdentical(page.Count, 1);
  });

  it("replaces the tags the template changes", async () => {
    // Given a deployed table with two tags.
    const simAws = new SimAws();
    await deployWithOrder(simAws, {
      Tags: [
        { Key: "team", Value: "orders" },
        { Key: "tier", Value: "gold" },
      ],
    });

    // When the stack is updated to drop one tag and change the other.
    await updateOrdersTable(simAws, {
      Tags: [{ Key: "team", Value: "fulfilment" }],
    });

    // Then the table carries only the new tag, and still holds the order.
    const table = simAws.dynamoDb().findTable("orders");
    assertNonNullable(table);
    const tags = await simAws
      .dynamoDb()
      .listTagsOfResource(
        new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
      );
    assertArrayEquals(
      tags.Tags.map((tag) => `${tag.Key}=${tag.Value}`),
      ["team=fulfilment"],
    );
    assertIdentical(await storedStatus(simAws), "open");
  });

  it("swaps the stream for one of the new view type", async () => {
    // Given a deployed table with a stream of new images.
    const simAws = new SimAws();
    await deployWithOrder(simAws, {
      StreamSpecification: { StreamViewType: "NEW_IMAGE" },
    });
    const before = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    // When the stack is updated to stream both images.
    await updateOrdersTable(simAws, {
      StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
    });

    // Then the table has a new stream of the new view type.
    const after = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    const table = after.Table;
    assertNonNullable(table);
    assertIdentical(
      table.StreamSpecification?.StreamViewType,
      "NEW_AND_OLD_IMAGES",
    );
    assertNotEqual(table.LatestStreamArn, before.Table?.LatestStreamArn);
    assertIdentical(await storedStatus(simAws), "open");
  });

  it("switches time to live on", async () => {
    // Given a deployed table with no time to live.
    const simAws = new SimAws();
    await deployWithOrder(simAws);

    // When the stack is updated to expire orders by an attribute.
    await updateOrdersTable(simAws, {
      TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    });

    // Then time to live is on for that attribute.
    const described = await simAws
      .dynamoDb()
      .describeTimeToLive(
        new DescribeTimeToLiveCommand({ TableName: "orders" }),
      );
    assertIdentical(
      described.TimeToLiveDescription?.AttributeName,
      "expiresAt",
    );
  });

  it("replaces the table when its key schema changes", async () => {
    // Given a deployed table holding an order, which CloudFormation names.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTable: simCfnDynamoDbTableResourceFactory.make({
            partitionKeyName: "orderId",
          }),
        },
      },
    });
    await stack.waitForDeployComplete();
    const before = deployedTable(simAws);

    // When the stack is updated to key the table differently.
    const rekeyed = simCfnDynamoDbTableResourceFactory.make({
      partitionKeyName: "customerId",
    });
    await simAws.cloudFormation().updateStack(
      new UpdateStackCommand({
        StackName: "orders-stack",
        TemplateBody: jsonStringify({ Resources: { OrdersTable: rekeyed } }),
      }),
    );
    await simAws.cloudFormation().waitForStackUpdateComplete("orders-stack");

    // Then the stack holds a new table keyed by the new attribute.
    const after = deployedTable(simAws);
    assertNotEqual(after, before);
    assertArrayEquals(after.keySchema.attributeNames(), ["customerId"]);
  });

  it("fails an update that changes the key of an index it keeps", async () => {
    // Given a deployed table with an index on the order's status.
    const simAws = new SimAws();
    await deployWithOrder(simAws, {
      AttributeDefinitions: statusAttributes,
      GlobalSecondaryIndexes: [statusIndex],
    });

    // When the stack is updated to key that index by another attribute.
    const error = await assertThrowsErrorAsync(async () => {
      await updateOrdersTable(simAws, {
        AttributeDefinitions: [
          ...statusAttributes,
          { AttributeName: "region", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
          {
            ...statusIndex,
            KeySchema: [{ AttributeName: "region", KeyType: "HASH" }],
          },
        ],
      });
    });

    // Then the update fails and the table keeps its order.
    assertStringIncludes(error.message, "Cannot update GSI byStatus");
    assertIdentical(await storedStatus(simAws), "open");

    const described = await simAws
      .cloudFormation()
      .describeStacks(new DescribeStacksCommand({ StackName: "orders-stack" }));
    assertIdentical(
      described.Stacks?.[0]?.StackStatus,
      "UPDATE_ROLLBACK_COMPLETE",
    );
  });
});

import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  byStatusCapacity,
  capacity,
  describedIndex,
  ordersByStatus,
  updateOrders,
} from "./sim-dynamodb-update-table-index-capacity.test-support.js";

describe("DynamoDB UpdateTableCommand index capacity", () => {
  it("gives an index new capacity, UPDATING until the table finishes", async () => {
    // Given a provisioned table with an index.
    const simAws = await ordersByStatus("PROVISIONED");

    // When the index is given more capacity.
    await updateOrders(simAws, {
      GlobalSecondaryIndexUpdates: [byStatusCapacity(20)],
    });

    // Then it is UPDATING, then ACTIVE with the capacity it was given.
    const updating = await describedIndex(simAws);
    assertIdentical(updating.IndexStatus, "UPDATING");
    await simAws.backgroundTasksComplete();
    const index = await describedIndex(simAws);
    assertIdentical(index.IndexStatus, "ACTIVE");
    assertObjectEquals(index.ProvisionedThroughput, {
      ReadCapacityUnits: 20,
      WriteCapacityUnits: 20,
      NumberOfDecreasesToday: 0,
    });
  });

  it("answers reads of an index whose capacity is changing", async () => {
    // Given a provisioned table whose index is being given new capacity.
    const simAws = await ordersByStatus("PROVISIONED");
    await updateOrders(simAws, {
      GlobalSecondaryIndexUpdates: [byStatusCapacity(20)],
    });

    // When the index is read, then it answers.
    const output = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "orders",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":open": { S: "OPEN" } },
      }),
    );
    assertIdentical(output.Count, 0);
  });

  it("takes an index's capacity away when the table goes on-demand", async () => {
    // Given a provisioned table with an index.
    const simAws = await ordersByStatus("PROVISIONED");

    // When the table switches to on-demand.
    await updateOrders(simAws, { BillingMode: "PAY_PER_REQUEST" });
    await simAws.backgroundTasksComplete();

    // Then the index has no capacity either.
    const index = await describedIndex(simAws);
    assertObjectEquals(index.ProvisionedThroughput, {
      ReadCapacityUnits: 0,
      WriteCapacityUnits: 0,
      NumberOfDecreasesToday: 0,
    });
  });

  it("provisions an index along with its table", async () => {
    // Given an on-demand table with an index.
    const simAws = await ordersByStatus("PAY_PER_REQUEST");

    // When the table switches to provisioned, naming the index's capacity too.
    await updateOrders(simAws, {
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: capacity,
      GlobalSecondaryIndexUpdates: [byStatusCapacity(8)],
    });
    await simAws.backgroundTasksComplete();

    // Then the index has the capacity it was given.
    const index = await describedIndex(simAws);
    assertIdentical(index.ProvisionedThroughput?.ReadCapacityUnits, 8);
  });
});

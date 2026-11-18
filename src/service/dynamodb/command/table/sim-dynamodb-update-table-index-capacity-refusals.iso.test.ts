import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import {
  byStatusCapacity,
  capacity,
  ordersByStatus,
  updateOrders,
} from "./sim-dynamodb-update-table-index-capacity.test-support.js";

describe("DynamoDB UpdateTableCommand index capacity refusals", () => {
  it("refuses capacity for an index of an on-demand table", async () => {
    // Given an on-demand table with an index.
    const simAws = await ordersByStatus("PAY_PER_REQUEST");

    // When the index is given capacity, then that is refused.
    const error = await assertThrowsErrorAsync(async () => {
      await updateOrders(simAws, {
        GlobalSecondaryIndexUpdates: [byStatusCapacity(20)],
      });
    });
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("refuses capacity for an index the table lacks", async () => {
    // Given a provisioned table with an index on status only.
    const simAws = await ordersByStatus("PROVISIONED");

    // When another index is given capacity, then it is not found.
    const error = await assertThrowsErrorAsync(async () => {
      await updateOrders(simAws, {
        GlobalSecondaryIndexUpdates: [
          {
            Update: {
              IndexName: "byCustomer",
              ProvisionedThroughput: capacity,
            },
          },
        ],
      });
    });
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });

  it("refuses a capacity change alongside a new index", async () => {
    // Given a provisioned table with an index.
    const simAws = await ordersByStatus("PROVISIONED");

    // When one request changes the index and creates another, then it is
    // refused, since UpdateTable does one of those at a time.
    const error = await assertThrowsErrorAsync(async () => {
      await updateOrders(simAws, {
        GlobalSecondaryIndexUpdates: [
          byStatusCapacity(20),
          {
            Create: {
              IndexName: "byOrder",
              KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
              Projection: { ProjectionType: "KEYS_ONLY" },
              ProvisionedThroughput: capacity,
            },
          },
        ],
      });
    });
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("needs each index's capacity to switch a table to provisioned", async () => {
    // Given an on-demand table with an index.
    const simAws = await ordersByStatus("PAY_PER_REQUEST");

    // When the table switches to provisioned without naming the index's
    // capacity, then that is refused.
    const error = await assertThrowsErrorAsync(async () => {
      await updateOrders(simAws, {
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: capacity,
      });
    });
    assertInstanceOf(error, SimDynamoDbValidationException);
  });
});

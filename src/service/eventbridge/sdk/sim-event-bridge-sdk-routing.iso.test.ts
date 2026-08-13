import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DescribeEventBusCommand,
  EventBridgeClient,
  ListEventBusesCommand,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

describe("EventBridge SDK interception", () => {
  it("routes an intercepted EventBridgeClient to simulated EventBridge", async () => {
    // Given an intercepted EventBridge SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(EventBridgeClient);

    const client = new EventBridgeClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a bus and puts an event on it.
    const created = await client.send(
      new CreateEventBusCommand({ Name: "orders" }),
    );
    const put = await client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: "orders",
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: JSON.stringify({ orderId: "order-1" }),
          },
        ],
      }),
    );

    // Then it works with nothing touching the network, and the ARN names the
    // Region the client was configured for.
    assertStringIncludes(
      String(created.EventBusArn),
      "arn:aws:events:eu-west-2:",
    );
    assertIdentical(put.FailedEntryCount, 0);
    assertNonNullable(put.Entries?.[0]?.EventId);
  });

  it("routes every supported Command through the intercepted client", async () => {
    // Given an intercepted EventBridge SDK client with a bus.
    using simSdk = new SimSdk();
    simSdk.intercept(EventBridgeClient);

    const client = new EventBridgeClient({ region: "us-east-1" });
    await client.send(new CreateEventBusCommand({ Name: "orders" }));

    // When each of the remaining operations is used.
    const described = await client.send(
      new DescribeEventBusCommand({ Name: "orders" }),
    );
    const listed = await client.send(new ListEventBusesCommand({}));

    await client.send(new DeleteEventBusCommand({ Name: "orders" }));

    const afterDelete = await client.send(new ListEventBusesCommand({}));

    // Then each answers as the simulated service does.
    assertIdentical(described.Name, "orders");
    assertArrayLength(listed.EventBuses ?? [], 2);
    assertArrayLength(afterDelete.EventBuses ?? [], 1);
    assertUndefined(listed.NextToken);
  });
});

import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  DescribeEventBusCommand,
  DescribeRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  PutEventsCommand,
  PutRuleCommand,
  TestEventPatternCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
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

  it("routes every rule Command through the intercepted client", async () => {
    // Given an intercepted EventBridge SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(EventBridgeClient);

    const client = new EventBridgeClient({ region: "us-east-1" });
    const pattern = JSON.stringify({ source: ["orders.service"] });

    // When a rule is created, read, switched off and on, tested and deleted.
    const put = await client.send(
      new PutRuleCommand({ Name: "watcher", EventPattern: pattern }),
    );
    const described = await client.send(
      new DescribeRuleCommand({ Name: "watcher" }),
    );
    const listed = await client.send(new ListRulesCommand({}));

    await client.send(new DisableRuleCommand({ Name: "watcher" }));

    const disabled = await client.send(
      new DescribeRuleCommand({ Name: "watcher" }),
    );

    await client.send(new EnableRuleCommand({ Name: "watcher" }));

    const tested = await client.send(
      new TestEventPatternCommand({
        EventPattern: pattern,
        Event: JSON.stringify({ source: "orders.service" }),
      }),
    );

    await client.send(new DeleteRuleCommand({ Name: "watcher" }));

    const afterDelete = await client.send(new ListRulesCommand({}));

    // Then each answers as the simulated service does.
    assertStringIncludes(String(put.RuleArn), "rule/watcher");
    assertIdentical(described.State, "ENABLED");
    assertIdentical(disabled.State, "DISABLED");
    assertArrayLength(listed.Rules ?? [], 1);
    assertTrue(tested.Result);
    assertArrayLength(afterDelete.Rules ?? [], 0);
  });
});

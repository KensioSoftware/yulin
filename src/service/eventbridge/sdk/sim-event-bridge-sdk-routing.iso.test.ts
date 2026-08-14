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
  ListRuleNamesByTargetCommand,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  TestEventPatternCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayEquals,
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

  it("routes every target Command through the intercepted client", async () => {
    // Given an intercepted client with a rule to hang targets on.
    using simSdk = new SimSdk();
    simSdk.intercept(EventBridgeClient);

    const client = new EventBridgeClient({ region: "us-east-1" });
    const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";

    await client.send(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: JSON.stringify({ source: ["orders.service"] }),
      }),
    );

    // When targets are added, listed both ways, and removed.
    const put = await client.send(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [{ Id: "queue", Arn: queueArn }],
      }),
    );
    const listed = await client.send(
      new ListTargetsByRuleCommand({ Rule: "orders" }),
    );
    const byTarget = await client.send(
      new ListRuleNamesByTargetCommand({ TargetArn: queueArn }),
    );
    const removed = await client.send(
      new RemoveTargetsCommand({ Rule: "orders", Ids: ["queue"] }),
    );
    const afterRemove = await client.send(
      new ListTargetsByRuleCommand({ Rule: "orders" }),
    );

    // Then each answers as the simulated service does.
    assertIdentical(put.FailedEntryCount, 0);
    assertArrayLength(listed.Targets ?? [], 1);
    assertArrayEquals(byTarget.RuleNames ?? [], ["orders"]);
    assertIdentical(removed.FailedEntryCount, 0);
    assertArrayLength(afterRemove.Targets ?? [], 0);
  });
});

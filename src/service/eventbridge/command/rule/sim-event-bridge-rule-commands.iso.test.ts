import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  DescribeRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  ListRulesCommand,
  PutEventsCommand,
  PutRuleCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEventBridgeResourceNotFoundException } from "../../error/sim-event-bridge.error.js";

/**
 * A pattern matching an order placed by the orders service.
 */
const orderPlaced = JSON.stringify({
  source: ["orders.service"],
  "detail-type": ["OrderPlaced"],
});

/**
 * Put one order event onto a bus.
 */
async function putOrderPlaced(simAws: SimAws, busName?: string): Promise<void> {
  await simAws.eventBridge().putEvents(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: busName,
          Source: "orders.service",
          DetailType: "OrderPlaced",
          Detail: JSON.stringify({ orderId: "order-1" }),
        },
      ],
    }),
  );
}

describe("EventBridge rule commands", () => {
  it("creates a rule on the default bus with an ARN that leaves the bus out", async () => {
    // Given a simulated AWS in one Account and Region.
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
    });

    // When a rule is created naming no bus.
    const created = await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "large-orders",
        EventPattern: orderPlaced,
      }),
    );

    // Then it is on the default bus, and its ARN carries only the rule name.
    assertIdentical(
      created.RuleArn,
      "arn:aws:events:eu-west-2:111111111111:rule/large-orders",
    );
    assertNonNullable(simAws.eventBridge().findRule("large-orders"));
  });

  it("names the bus in the ARN of a rule on a custom bus", async () => {
    // Given a custom bus.
    const simAws = new SimAws();
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // When a rule is created on it.
    const created = await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "large-orders",
        EventBusName: "orders",
        EventPattern: orderPlaced,
      }),
    );

    // Then the ARN carries the bus as well, which is what keeps two rules of
    // the same name on two buses apart.
    assertIdentical(
      created.RuleArn,
      "arn:aws:events:us-east-1:888888888888:rule/orders/large-orders",
    );
  });

  it("matches an event against the rules of the bus it was put onto", async () => {
    // Given a rule on the default bus and one on a custom bus.
    const simAws = new SimAws();
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));
    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "watcher", EventPattern: orderPlaced }),
      );
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "watcher",
        EventBusName: "orders",
        EventPattern: orderPlaced,
      }),
    );

    // When an event is put onto the custom bus.
    await putOrderPlaced(simAws, "orders");

    // Then only that bus's rule matched it.
    const [receipt] = simAws.eventBridge().receiptsOn("orders");

    assertArrayEquals(receipt?.matchedRuleNames, ["watcher"]);
    assertArrayLength(simAws.eventBridge().receiptsOn("default"), 0);
  });

  it("takes an event that matches no rule, and matches nothing", async () => {
    // Given a rule that wants a different source.
    const simAws = new SimAws();
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "billing-only",
        EventPattern: JSON.stringify({ source: ["billing.service"] }),
      }),
    );

    // When an order event is put.
    await putOrderPlaced(simAws);

    // Then the bus took it and no rule matched, as a bus does on real AWS.
    const [receipt] = simAws.eventBridge().receiptsOn("default");

    assertArrayLength(receipt?.matchedRuleNames ?? [], 0);
  });

  it("stops matching while a rule is disabled", async () => {
    // Given a rule that matches.
    const simAws = new SimAws();
    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "watcher", EventPattern: orderPlaced }),
      );

    // When it is disabled, an event is put, then it is enabled and another is.
    await simAws
      .eventBridge()
      .disableRule(new DisableRuleCommand({ Name: "watcher" }));
    await putOrderPlaced(simAws);
    await simAws
      .eventBridge()
      .enableRule(new EnableRuleCommand({ Name: "watcher" }));
    await putOrderPlaced(simAws);

    // Then only the second event matched, and the first is not replayed.
    const receipts = simAws.eventBridge().receiptsOn("default");

    assertArrayLength(receipts[0]?.matchedRuleNames ?? [], 0);
    assertArrayEquals(receipts[1]?.matchedRuleNames, ["watcher"]);
  });

  it("replaces a rule rather than merging into it", async () => {
    // Given a rule with a description.
    const simAws = new SimAws();
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "watcher",
        EventPattern: orderPlaced,
        Description: "Watches orders",
      }),
    );

    // When it is put again with no description.
    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "watcher", EventPattern: orderPlaced }),
      );

    // Then the description is gone, since PutRule replaces the whole rule.
    const described = await simAws
      .eventBridge()
      .describeRule(new DescribeRuleCommand({ Name: "watcher" }));

    assertUndefined(described.Description);
    assertIdentical(described.State, "ENABLED");
  });

  it("describes and lists rules by bus", async () => {
    // Given two rules on the default bus.
    const simAws = new SimAws();
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders-watcher",
        EventPattern: orderPlaced,
      }),
    );
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "billing-watcher",
        EventPattern: orderPlaced,
      }),
    );

    // When they are described and listed by prefix.
    const described = await simAws
      .eventBridge()
      .describeRule(new DescribeRuleCommand({ Name: "orders-watcher" }));
    const listed = await simAws
      .eventBridge()
      .listRules(new ListRulesCommand({ NamePrefix: "orders-" }));

    // Then the pattern comes back as it was written.
    assertIdentical(described.EventPattern, orderPlaced);
    assertIdentical(described.EventBusName, "default");
    assertArrayEquals(
      listed.Rules?.map((rule) => rule.Name),
      ["orders-watcher"],
    );
  });

  it("deletes a rule, and takes a repeated delete in its stride", async () => {
    // Given a rule.
    const simAws = new SimAws();
    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "watcher", EventPattern: orderPlaced }),
      );

    // When it is deleted twice.
    await simAws
      .eventBridge()
      .deleteRule(new DeleteRuleCommand({ Name: "watcher" }));
    await simAws
      .eventBridge()
      .deleteRule(new DeleteRuleCommand({ Name: "watcher" }));

    // Then it is gone, and neither delete failed.
    assertUndefined(simAws.eventBridge().findRule("watcher"));

    // And describing it now refuses.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .describeRule(new DescribeRuleCommand({ Name: "watcher" }));
    });

    assertInstanceOf(error, SimEventBridgeResourceNotFoundException);
  });

  it("takes a bus's rules with it when the bus is deleted", async () => {
    // Given a rule on a custom bus.
    const simAws = new SimAws();
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "watcher",
        EventBusName: "orders",
        EventPattern: orderPlaced,
      }),
    );

    // When the bus is deleted and recreated.
    await simAws
      .eventBridge()
      .deleteEventBus(new DeleteEventBusCommand({ Name: "orders" }));
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // Then the rule went with the bus rather than outliving it.
    assertUndefined(simAws.eventBridge().findRule("watcher", "orders"));
  });
});

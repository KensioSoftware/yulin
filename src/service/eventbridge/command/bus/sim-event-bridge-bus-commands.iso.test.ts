import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DescribeEventBusCommand,
  ListEventBusesCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimEventBridgeResourceNotFoundException } from "../../error/sim-event-bridge.error.js";

describe("EventBridge event bus commands", () => {
  it("has a default event bus that was never created", async () => {
    // Given a simulated AWS in one Account and Region.
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
    });

    // When the bus nothing created is described.
    const described = await simAws
      .eventBridge()
      .describeEventBus(new DescribeEventBusCommand({}));

    // Then it is the default bus, with an ARN naming its Account and Region.
    assertIdentical(described.Name, "default");
    assertIdentical(
      described.Arn,
      "arn:aws:events:eu-west-2:111111111111:event-bus/default",
    );
  });

  it("creates a custom bus and reports it alongside the default one", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a bus is created.
    const created = await simAws.eventBridge().createEventBus(
      new CreateEventBusCommand({
        Name: "orders",
        Description: "Order domain events",
      }),
    );

    // Then its ARN carries the event-bus resource type.
    assertIdentical(
      created.EventBusArn,
      "arn:aws:events:us-east-1:888888888888:event-bus/orders",
    );

    // And a listing reports it after the default bus.
    const listed = await simAws
      .eventBridge()
      .listEventBuses(new ListEventBusesCommand({}));

    assertArrayEquals(
      listed.EventBuses?.map((bus) => bus.Name),
      ["default", "orders"],
    );
    assertUndefined(listed.NextToken);

    // And describing it reports the description it was created with.
    const described = await simAws
      .eventBridge()
      .describeEventBus(new DescribeEventBusCommand({ Name: "orders" }));

    assertIdentical(described.Description, "Order domain events");
  });

  it("stamps a bus creation time from the simulation's clock", async () => {
    // Given a simulation started at a known instant.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });

    // When time moves on and a bus is created.
    await simAws.clock().advanceBy({ hours: 2 });
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // Then the bus was created at the simulated time, not the host's.
    const described = await simAws
      .eventBridge()
      .describeEventBus(new DescribeEventBusCommand({ Name: "orders" }));

    assertIdentical(
      described.CreationTime?.toISOString(),
      "2026-07-26T11:00:00.000Z",
    );
  });

  it("describes a bus by its ARN as well as by its name", async () => {
    // Given a created bus.
    const simAws = new SimAws();
    const created = await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // When it is described by ARN.
    const described = await simAws
      .eventBridge()
      .describeEventBus(
        new DescribeEventBusCommand({ Name: created.EventBusArn }),
      );

    // Then it is the same bus.
    assertIdentical(described.Name, "orders");
  });

  it("deletes a custom bus, and takes a repeated delete in its stride", async () => {
    // Given a created bus.
    const simAws = new SimAws();
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // When it is deleted twice.
    await simAws
      .eventBridge()
      .deleteEventBus(new DeleteEventBusCommand({ Name: "orders" }));
    await simAws
      .eventBridge()
      .deleteEventBus(new DeleteEventBusCommand({ Name: "orders" }));

    // Then it is gone, and neither delete failed.
    assertUndefined(simAws.eventBridge().findEventBus("orders"));

    // And the name is free to use again straight away.
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    assertNonNullable(simAws.eventBridge().findEventBus("orders"));
  });

  it("keeps buses to their own Account and Region", async () => {
    // Given a bus in one Account and Region.
    const simAws = new SimAws();
    await simAws
      .account("111111111111")
      .region("eu-west-2")
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // When another Region's EventBridge is asked for it.
    const listed = await simAws
      .account("111111111111")
      .region("us-east-1")
      .eventBridge()
      .listEventBuses(new ListEventBusesCommand({}));

    // Then it has only its own default bus.
    assertArrayEquals(
      listed.EventBuses?.map((bus) => bus.Name),
      ["default"],
    );

    // And describing the bus there finds nothing.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account("111111111111")
        .region("us-east-1")
        .eventBridge()
        .describeEventBus(new DescribeEventBusCommand({ Name: "orders" }));
    });

    assertInstanceOf(error, SimEventBridgeResourceNotFoundException);
  });

  it("narrows a listing to a name prefix, a page at a time", async () => {
    // Given more buses than one listing page holds.
    const simAws = new SimAws();
    for (let index = 0; index < 12; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws
        .eventBridge()
        .createEventBus(
          new CreateEventBusCommand({ Name: `orders-${String(index)}` }),
        );
    }

    // When they are listed by prefix, ten at a time.
    const first = await simAws.eventBridge().listEventBuses(
      new ListEventBusesCommand({
        NamePrefix: "orders-",
        Limit: 10,
      }),
    );
    const second = await simAws.eventBridge().listEventBuses(
      new ListEventBusesCommand({
        NamePrefix: "orders-",
        Limit: 10,
        NextToken: first.NextToken,
      }),
    );

    // Then the default bus is left out by the prefix, and the rest page.
    assertIdentical(first.EventBuses?.length, 10);
    assertIdentical(second.EventBuses?.length, 2);
    assertUndefined(second.NextToken);
  });
});

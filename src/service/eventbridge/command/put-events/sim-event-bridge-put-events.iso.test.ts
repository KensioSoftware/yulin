import {
  CreateEventBusCommand,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";

describe("EventBridge PutEvents", () => {
  it("takes an event onto the default bus and gives it an id", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When an event is put with no bus named.
    const output = await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          {
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: JSON.stringify({ orderId: "order-1", total: 4200 }),
          },
        ],
      }),
    );

    // Then the entry succeeded, with an id and no failures.
    assertIdentical(output.FailedEntryCount, 0);
    assertNonNullable(output.Entries?.[0]?.EventId);

    // And the default bus received it.
    assertArrayLength(simAws.eventBridge().eventsOn("default"), 1);
  });

  it("builds the envelope AWS wraps around an entry", async () => {
    // Given a simulation in a known Account and Region, at a known instant.
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });

    // When an event naming no time of its own is put.
    const output = await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          {
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: JSON.stringify({ orderId: "order-1" }),
            Resources: ["arn:aws:s3:::orders"],
          },
        ],
      }),
    );

    // Then the envelope carries the simulation's own clock and scope.
    const event = simAws.eventBridge().eventsOn("default")[0];

    assertNonNullable(event);
    assertObjectEquals(event.toEnvelope(), {
      version: "0",
      id: output.Entries?.[0]?.EventId,
      "detail-type": "OrderPlaced",
      source: "orders.service",
      account: "111111111111",
      time: "2026-07-26T09:00:00Z",
      region: "eu-west-2",
      resources: ["arn:aws:s3:::orders"],
      detail: { orderId: "order-1" },
    });
  });

  it("keeps the time an entry names for itself", async () => {
    // Given a simulation at a known instant.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });

    // When an entry carries a time of its own.
    await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          {
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: "{}",
            Time: new Date("2026-07-25T08:30:00.000Z"),
          },
        ],
      }),
    );

    // Then that is the time on the event, not the time of the call.
    const event = simAws.eventBridge().eventsOn("default")[0];

    assertIdentical(event?.toEnvelope().time, "2026-07-25T08:30:00Z");
  });

  it("puts each entry on the bus that entry names", async () => {
    // Given two buses alongside the default one.
    const simAws = new SimAws();
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // When one request carries an entry for each.
    await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: "orders",
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: "{}",
          },
          {
            Source: "billing.service",
            DetailType: "InvoiceRaised",
            Detail: "{}",
          },
        ],
      }),
    );

    // Then each bus received only its own.
    assertArrayEquals(
      simAws
        .eventBridge()
        .eventsOn("orders")
        .map((event) => event.source),
      ["orders.service"],
    );
    assertArrayEquals(
      simAws
        .eventBridge()
        .eventsOn("default")
        .map((event) => event.source),
      ["billing.service"],
    );
  });

  it("accepts an event for a bus that does not exist, and drops it", async () => {
    // Given a simulated EventBridge with no bus of that name.
    const simAws = new SimAws();

    // When an event is put onto a name that was never created.
    const output = await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: "typo",
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: "{}",
          },
        ],
      }),
    );

    // Then the entry succeeded, as it does on real AWS, and the event is gone.
    assertIdentical(output.FailedEntryCount, 0);
    assertNonNullable(output.Entries?.[0]?.EventId);
    assertArrayEmpty(simAws.eventBridge().eventsOn("typo"));
    assertArrayEmpty(simAws.eventBridge().eventsOn("default"));
  });

  it("keeps events out of another Account and Region's buses", async () => {
    // Given an event put in one Region.
    const simAws = new SimAws();
    await simAws
      .account("111111111111")
      .region("eu-west-2")
      .eventBridge()
      .putEvents(
        new PutEventsCommand({
          Entries: [
            {
              Source: "orders.service",
              DetailType: "OrderPlaced",
              Detail: "{}",
            },
          ],
        }),
      );

    // When another Region's default bus is looked at.
    const elsewhere = simAws
      .account("111111111111")
      .region("us-east-1")
      .eventBridge()
      .eventsOn("default");

    // Then the event did not reach it.
    assertArrayEmpty(elsewhere);
  });
});

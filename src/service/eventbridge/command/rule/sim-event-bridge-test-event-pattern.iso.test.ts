import { TestEventPatternCommand } from "@aws-sdk/client-eventbridge";
import {
  assertFalse,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimEventBridgeInvalidEventPatternException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

const anyOrder = JSON.stringify({ source: ["orders.service"] });

describe("EventBridge TestEventPattern", () => {
  it("answers whether an event matches, without creating anything", async () => {
    // Given a simulated EventBridge with no rules and no buses of its own.
    const simAws = new SimAws();

    // When a pattern is tested against a matching and a non-matching event.
    const matched = await simAws.eventBridge().testEventPattern(
      new TestEventPatternCommand({
        EventPattern: anyOrder,
        Event: JSON.stringify({ source: "orders.service" }),
      }),
    );
    const unmatched = await simAws.eventBridge().testEventPattern(
      new TestEventPatternCommand({
        EventPattern: anyOrder,
        Event: JSON.stringify({ source: "billing.service" }),
      }),
    );

    // Then it says so, and no rule was created along the way.
    assertTrue(matched.Result);
    assertFalse(unmatched.Result);
  });

  it("refuses a pattern it could not evaluate, as PutRule would", async () => {
    // Given a pattern using an operator this simulation does not evaluate.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().testEventPattern(
        new TestEventPatternCommand({
          EventPattern: JSON.stringify({ source: [{ wildcard: "orders.*" }] }),
          Event: JSON.stringify({ source: "orders.service" }),
        }),
      );
    });

    // Then it is refused here too, which is what makes this a way to check a
    // pattern before writing a rule with it.
    assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
  });

  it("refuses a request missing the pattern or the event", async () => {
    // Given requests leaving out one side of the comparison.
    const simAws = new SimAws();

    const noPattern = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .testEventPattern(
          new TestEventPatternCommand({ EventPattern: undefined, Event: "{}" }),
        );
    });
    const noEvent = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().testEventPattern(
        new TestEventPatternCommand({
          EventPattern: anyOrder,
          Event: undefined,
        }),
      );
    });

    // Then both are refused, naming what is missing.
    assertInstanceOf(noPattern, SimEventBridgeValidationException);
    assertStringIncludes(noPattern.message, "EventPattern is required");
    assertInstanceOf(noEvent, SimEventBridgeValidationException);
    assertStringIncludes(noEvent.message, "Event is required");
  });

  it("refuses an event that is not a JSON object", async () => {
    // Given events that are not JSON, and JSON that is not an object.
    const simAws = new SimAws();

    const notJson = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().testEventPattern(
        new TestEventPatternCommand({
          EventPattern: anyOrder,
          Event: "not json",
        }),
      );
    });
    const notObject = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .testEventPattern(
          new TestEventPatternCommand({ EventPattern: anyOrder, Event: "[]" }),
        );
    });

    // Then both are refused rather than tested against nothing.
    assertInstanceOf(notJson, SimEventBridgeValidationException);
    assertInstanceOf(notObject, SimEventBridgeValidationException);
  });
});

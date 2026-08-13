import { assertArrayEquals, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimEventBridge } from "../sim-event-bridge.js";

describe("EventBridge SDK Command router", () => {
  it("names the Commands simulated EventBridge can handle", () => {
    // Given a simulated EventBridge.
    const simEventBridge = new SimEventBridge();

    // When its router is asked what it supports.
    const supported = simEventBridge.sdkCommandRouter().supportedCommandNames();

    // Then it names the bus commands and PutEvents.
    assertArrayEquals(supported, [
      "CreateEventBusCommand",
      "DeleteEventBusCommand",
      "DescribeEventBusCommand",
      "ListEventBusesCommand",
      "PutEventsCommand",
    ]);
  });

  it("has no route for a Command it does not support", () => {
    // Given a simulated EventBridge.
    const simEventBridge = new SimEventBridge();

    // When a Command from a later change is asked for.
    const route = simEventBridge.sdkCommandRouter().route("PutRuleCommand");

    // Then there is none, so the interception engine reports it rather than
    // this service answering a rule request it cannot handle.
    assertUndefined(route);
  });
});

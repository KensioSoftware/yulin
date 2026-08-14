import { assertArrayEquals, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimEventBridge } from "../sim-event-bridge.js";

describe("EventBridge SDK Command router", () => {
  it("names the Commands simulated EventBridge can handle", () => {
    // Given a simulated EventBridge.
    const simEventBridge = new SimEventBridge();

    // When its router is asked what it supports.
    const supported = simEventBridge.sdkCommandRouter().supportedCommandNames();

    // Then it names the bus, event, rule and target commands.
    assertArrayEquals(supported, [
      "CreateEventBusCommand",
      "DeleteEventBusCommand",
      "DescribeEventBusCommand",
      "ListEventBusesCommand",
      "PutEventsCommand",
      "PutRuleCommand",
      "DeleteRuleCommand",
      "DescribeRuleCommand",
      "ListRulesCommand",
      "EnableRuleCommand",
      "DisableRuleCommand",
      "TestEventPatternCommand",
      "PutTargetsCommand",
      "RemoveTargetsCommand",
      "ListTargetsByRuleCommand",
      "ListRuleNamesByTargetCommand",
    ]);
  });

  it("has no route for a Command it does not support", () => {
    // Given a simulated EventBridge.
    const simEventBridge = new SimEventBridge();

    // When a Command for something this simulation does not model is asked
    // for, such as granting another Account access to a bus.
    const route = simEventBridge
      .sdkCommandRouter()
      .route("PutPermissionCommand");

    // Then there is none, so the interception engine reports it rather than
    // this service answering a request it cannot handle.
    assertUndefined(route);
  });
});

import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimEventBridgeDeliveryFailures } from "./sim-event-bridge-delivery-failures.js";

describe("EventBridge delivery failure", () => {
  it("reads a message off whatever the delivery threw", () => {
    // Given deliveries that failed with an Error and with something else.
    const failures = new SimEventBridgeDeliveryFailures();
    const recorded = {
      ruleName: "orders",
      ruleArn: "arn:aws:events:us-east-1:888888888888:rule/orders",
      targetId: "queue",
      targetArn: "arn:aws:sqs:us-east-1:888888888888:orders",
      eventId: "0f2c9d6e",
    };

    failures.record({ ...recorded, error: new Error("the queue said no") });
    failures.record({ ...recorded, error: "the queue said no, rudely" });

    // Then both read as a message, so a test asserting on one does not have to
    // know what a target threw.
    assertIdentical(failures.all[0]?.message, "the queue said no");
    assertIdentical(failures.all[1]?.message, "the queue said no, rudely");
  });
});

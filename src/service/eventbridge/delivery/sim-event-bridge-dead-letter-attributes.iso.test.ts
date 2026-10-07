import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimEventBridgeDeliveryNotPermitted,
  SimEventBridgeTargetNotFound,
} from "../error/sim-event-bridge-delivery.error.js";
import { SimEventBridgeEvent } from "../event/sim-event-bridge-event.js";
import { SimEventTarget } from "../target/sim-event-target.js";
import { simEventBridgeDeadLetterAttributes } from "./sim-event-bridge-dead-letter-attributes.js";
import type { SimEventBridgeExhaustedRetryCondition } from "./sim-event-bridge-delivery.js";

describe("EventBridge dead-letter message attributes", () => {
  /**
   * The attributes a dead letter carries for one failure.
   */
  function attributesFor(
    error: unknown,
    exhaustedCondition?: SimEventBridgeExhaustedRetryCondition,
  ): Record<string, string | undefined> {
    const attributes = simEventBridgeDeadLetterAttributes({
      delivery: {
        target: SimEventTarget.of({
          Id: "fulfilment",
          Arn: "arn:aws:sqs:us-east-1:888888888888:fulfilment",
        }),
        event: new SimEventBridgeEvent({
          id: "event-1",
          detailType: "OrderPlaced",
          source: "orders.service",
          account: "888888888888",
          time: new Date("2026-10-07T09:00:00.000Z"),
          region: "us-east-1",
          resources: [],
          detail: {},
        }),
        ruleArn: "arn:aws:events:us-east-1:888888888888:rule/orders",
        ruleName: "orders",
        ruleOwnerAccountId: "888888888888",
      },
      error,
      retryAttempts: 1,
      exhaustedCondition,
    });

    return Object.fromEntries(
      Object.entries(attributes).map(([name, value]) => [
        name,
        value.StringValue,
      ]),
    );
  }

  it("names each failure by the code EventBridge lists for it", () => {
    // Given a refusal, a missing target and anything else.
    // When each is written as a dead letter.
    const codes = [
      new SimEventBridgeDeliveryNotPermitted("refused"),
      new SimEventBridgeTargetNotFound("missing"),
      new Error("target timed out"),
    ].map((error) => attributesFor(error)["ERROR_CODE"]);

    // Then each gets its own code.
    assertIdentical(
      codes.join(","),
      "NO_PERMISSIONS,NO_RESOURCE,ERROR_FROM_TARGET",
    );
  });

  it("writes a failure that is not an Error as its message", () => {
    // Given a failure thrown as a plain string.
    // When it is written as a dead letter.
    const attributes = attributesFor("target timed out");

    // Then the string is the message.
    assertIdentical(attributes["ERROR_MESSAGE"], "target timed out");
  });

  it("names the retry limit that ran out, and only when one did", () => {
    // Given a failure retried until its limit, and one never retried.
    // When each is written as a dead letter.
    const exhausted = attributesFor(new Error("busy"), "MaximumRetryAttempts");
    const refused = attributesFor(new Error("busy"));

    // Then only the first says which limit ran out.
    assertIdentical(
      exhausted["EXHAUSTED_RETRY_CONDITION"],
      "MaximumRetryAttempts",
    );
    assertUndefined(refused["EXHAUSTED_RETRY_CONDITION"]);
  });
});

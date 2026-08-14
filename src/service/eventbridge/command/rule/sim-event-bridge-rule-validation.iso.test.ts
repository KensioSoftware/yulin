import {
  PutRuleCommand,
  type PutRuleCommandInput,
} from "@aws-sdk/client-eventbridge";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimEventBridgeInvalidEventPatternException,
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

const anyOrder = JSON.stringify({ source: ["orders.service"] });

/**
 * Try to create a rule, and answer with what it was refused with.
 */
async function refusedRule(input: PutRuleCommandInput): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    await simAws.eventBridge().putRule(new PutRuleCommand(input));
  });
}

describe("EventBridge rule validation", () => {
  it("refuses a rule with no name", async () => {
    const error = await refusedRule({
      Name: undefined,
      EventPattern: anyOrder,
    });

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "Name is required");
  });

  it("refuses a rule name real EventBridge would refuse", async () => {
    // Given names with a disallowed character and one over 64 characters.
    const spaced = await refusedRule({
      Name: "large orders",
      EventPattern: anyOrder,
    });
    const tooLong = await refusedRule({
      Name: "o".repeat(65),
      EventPattern: anyOrder,
    });

    // Then both are refused, unlike a bus name, which may run to 256.
    assertInstanceOf(spaced, SimEventBridgeValidationException);
    assertStringIncludes(spaced.message, "large orders");
    assertInstanceOf(tooLong, SimEventBridgeValidationException);
  });

  it("refuses a rule with neither a pattern nor a schedule", async () => {
    // Given a rule carrying nothing that would make it fire.
    const error = await refusedRule({
      Name: "watcher",
      EventPattern: undefined,
    });

    // Then it is refused, naming both of the things it could have carried.
    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    assertStringIncludes(error.message, "EventPattern");
    assertStringIncludes(error.message, "ScheduleExpression");
  });

  it("refuses rule inputs it does not model rather than dropping them", async () => {
    // Given a rule asked for with each unmodelled property in turn.
    const withRole = await refusedRule({
      Name: "watcher",
      EventPattern: anyOrder,
      RoleArn: "arn:aws:iam::888888888888:role/EventsRole",
    });
    const withTags = await refusedRule({
      Name: "watcher",
      EventPattern: anyOrder,
      Tags: [{ Key: "team", Value: "orders" }],
    });

    assertInstanceOf(withRole, SimEventBridgeUnsimulatedInputException);
    assertInstanceOf(withTags, SimEventBridgeUnsimulatedInputException);
  });

  it("refuses a description longer than real EventBridge takes", async () => {
    const error = await refusedRule({
      Name: "watcher",
      EventPattern: anyOrder,
      Description: "x".repeat(513),
    });

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "512");
  });

  it("refuses a pattern longer than real EventBridge takes", async () => {
    // Given a pattern over 4096 characters.
    const error = await refusedRule({
      Name: "watcher",
      EventPattern: JSON.stringify({ source: ["o".repeat(4200)] }),
    });

    assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
    assertStringIncludes(error.message, "4096");
  });

  it("refuses the CloudTrail management events state, saying why", async () => {
    // Given the third state real EventBridge has.
    const error = await refusedRule({
      Name: "watcher",
      EventPattern: anyOrder,
      State: "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS",
    });

    // Then it is refused, because nothing here delivers CloudTrail management
    // events and the rule would quietly behave like an enabled one.
    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    assertStringIncludes(error.message, "CloudTrail");
  });

  it("refuses a state that is not one a rule has", async () => {
    // Given a state the SDK's own types would not allow, which is why this
    // one goes straight to the simulated service.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putRule({
        input: { Name: "watcher", EventPattern: anyOrder, State: "PAUSED" },
      });
    });

    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    assertStringIncludes(error.message, "PAUSED");
  });

  it("creates a rule disabled when the request says so", async () => {
    // Given a rule created in the disabled state.
    const simAws = new SimAws();
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "watcher",
        EventPattern: anyOrder,
        State: "DISABLED",
      }),
    );

    // Then it is off from the start rather than needing a DisableRule.
    assertStringIncludes(
      simAws.eventBridge().findRule("watcher")?.state.value ?? "",
      "DISABLED",
    );
  });
});

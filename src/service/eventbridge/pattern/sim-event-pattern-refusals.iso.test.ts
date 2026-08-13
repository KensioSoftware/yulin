import { PutRuleCommand } from "@aws-sdk/client-eventbridge";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimEventBridgeInvalidEventPatternException } from "../error/sim-event-bridge.error.js";

/**
 * Try to create a rule with a pattern, and answer with what it was refused
 * with.
 */
async function refusedPattern(pattern: unknown): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "watcher",
        EventPattern: JSON.stringify(pattern),
      }),
    );
  });
}

describe("EventBridge event pattern refusals", () => {
  it("refuses a pattern that is not a JSON object", async () => {
    // Given patterns that are not shaped like a pattern at all.
    const notPatterns = ['"orders"', "[]", "42", "not json"];
    const simAws = new SimAws();

    for (const source of notPatterns) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () => {
        await simAws
          .eventBridge()
          .putRule(
            new PutRuleCommand({ Name: "watcher", EventPattern: source }),
          );
      });

      assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
    }
  });

  it("refuses a pattern key that is neither a condition list nor an object", async () => {
    // Given a field written as a bare value rather than as a list.
    const error = await refusedPattern({ source: "orders.service" });

    // Then it is refused, since a pattern field takes a list of conditions.
    assertStringIncludes(error.message, "source");
  });

  it("refuses an empty pattern and an empty condition list", async () => {
    // Given a pattern putting no conditions on anything.
    const empty = await refusedPattern({});
    const emptyField = await refusedPattern({ source: [] });

    // Then both are refused rather than matching everything.
    assertInstanceOf(empty, SimEventBridgeInvalidEventPatternException);
    assertInstanceOf(emptyField, SimEventBridgeInvalidEventPatternException);
  });

  it("refuses a condition written with more than one operator", async () => {
    // Given a condition object carrying two operators.
    const error = await refusedPattern({
      source: [{ prefix: "orders", suffix: ".service" }],
    });

    // Then it is refused rather than one of them being picked.
    assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
  });

  it("refuses an operator EventBridge does not have at all", async () => {
    // Given a mistyped operator.
    const error = await refusedPattern({ source: [{ prefixx: "orders" }] });

    // Then the message says it is not an operator, rather than that it is not
    // simulated, so the two cases read differently.
    assertStringIncludes(error.message, "not an operator");
  });

  it("refuses a numeric condition that is not comparator and number pairs", async () => {
    // Given numeric conditions written wrongly.
    const oddLength = await refusedPattern({
      detail: { total: [{ numeric: [">"] }] },
    });
    const badComparator = await refusedPattern({
      detail: { total: [{ numeric: ["~", 10] }] },
    });
    const badOperand = await refusedPattern({
      detail: { total: [{ numeric: [">", "10"] }] },
    });

    // Then each is refused.
    assertInstanceOf(oddLength, SimEventBridgeInvalidEventPatternException);
    assertInstanceOf(badComparator, SimEventBridgeInvalidEventPatternException);
    assertInstanceOf(badOperand, SimEventBridgeInvalidEventPatternException);
  });

  it("refuses an exists condition that is not a boolean", async () => {
    const error = await refusedPattern({
      detail: { orderId: [{ exists: "true" }] },
    });

    assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
  });

  it("refuses a prefix that is not a string, and a nested list of conditions", async () => {
    const notString = await refusedPattern({ source: [{ prefix: 42 }] });
    const nestedList = await refusedPattern({ source: [["orders.service"]] });

    assertInstanceOf(notString, SimEventBridgeInvalidEventPatternException);
    assertInstanceOf(nestedList, SimEventBridgeInvalidEventPatternException);
  });

  it("refuses a numeric condition that is not a list at all", async () => {
    const error = await refusedPattern({
      detail: { total: [{ numeric: "greater than ten" }] },
    });

    assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
    assertStringIncludes(error.message, "takes a list");
  });

  it("refuses an anything-but excluding nothing", async () => {
    const error = await refusedPattern({
      detail: { currency: [{ "anything-but": [] }] },
    });

    assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
  });
});

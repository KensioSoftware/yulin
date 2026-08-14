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

describe("EventBridge event pattern unsupported operators", () => {
  it("refuses an operator real EventBridge has and this does not, by name", async () => {
    // Given patterns using each unsimulated operator in turn.
    const unsimulated = [
      { "source-ip": [{ cidr: "10.0.0.0/24" }] },
      { source: [{ "equals-ignore-case": "orders.service" }] },
      { source: [{ wildcard: "orders.*" }] },
      { $or: [{ source: ["orders.service"] }, { region: ["us-east-1"] }] },
    ];

    // Then each is refused with its own name in the message, rather than
    // quietly never matching.
    for (const pattern of unsimulated) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await refusedPattern(pattern);

      assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
      assertStringIncludes(error.message, "not simulated");
    }
  });

  it("names the operator it refused", async () => {
    // Given a pattern using a wildcard.
    const error = await refusedPattern({ source: [{ wildcard: "orders.*" }] });

    // Then the message says which operator, so a reader can tell an
    // unsimulated operator from a mistyped one.
    assertStringIncludes(error.message, "wildcard");
  });

  it("refuses the nested forms of anything-but", async () => {
    // Given anything-but written with an operator inside it.
    const error = await refusedPattern({
      detail: { state: [{ "anything-but": { prefix: "init" } }] },
    });

    // Then it is refused, naming both operators.
    assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
    assertStringIncludes(error.message, "anything-but with prefix");
  });

  it("refuses a prefix written to ignore case", async () => {
    // Given a prefix with a nested equals-ignore-case.
    const error = await refusedPattern({
      detail: { service: [{ prefix: { "equals-ignore-case": "eventb" } }] },
    });

    // Then it is refused rather than compared case-sensitively, which would
    // answer a different question from the one the pattern asked.
    assertStringIncludes(error.message, "prefix with equals-ignore-case");
  });

  it("refuses an anything-but written as an object it does not know", async () => {
    // Given anything-but written with no operator inside it at all.
    const error = await refusedPattern({
      detail: { currency: [{ "anything-but": {} }] },
    });

    // Then it is refused as a nested form rather than read as excluding
    // nothing.
    assertInstanceOf(error, SimEventBridgeInvalidEventPatternException);
    assertStringIncludes(error.message, "nested operator");
  });
});

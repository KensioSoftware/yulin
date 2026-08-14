import {
  CreateEventBusCommand,
  DescribeRuleCommand,
  ListRulesCommand,
  PutRuleCommand,
  type PutRuleCommandInput,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../error/sim-event-bridge.error.js";

/**
 * Try to create a rule, and answer with what it was refused with.
 */
async function refusedRule(input: PutRuleCommandInput): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    await simAws.eventBridge().putRule(new PutRuleCommand(input));
  });
}

describe("EventBridge schedule expression validation", () => {
  it("refuses a rate under the minute AWS runs", async () => {
    // Given a rule asking to fire every thirty seconds.
    const error = await refusedRule({
      Name: "twitchy",
      ScheduleExpression: "rate(30 seconds)",
    });

    // Then it is refused saying why there is no such unit.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "no schedule finer than one a minute");
  });

  it("refuses a rate whose unit does not agree with its value", async () => {
    const error = await refusedRule({
      Name: "hourly",
      ScheduleExpression: "rate(1 hours)",
    });

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "'1 hour'");
  });

  it("refuses a cron expression short of its six fields", async () => {
    // Given a five field expression, which is what Unix cron takes.
    const error = await refusedRule({
      Name: "noon",
      ScheduleExpression: "cron(0 12 * * ?)",
    });

    // Then it is refused naming the six field form EventBridge expects.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(
      error.message,
      "minutes hours day-of-month month day-of-week year",
    );
  });

  it("refuses the cron wildcards it reads no meaning from", async () => {
    // Given the last-day-of-month wildcard, which real EventBridge does take.
    const error = await refusedRule({
      Name: "month-end",
      ScheduleExpression: "cron(0 12 L * ? *)",
    });

    // Then it is refused as unsimulated rather than as a mistake.
    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    assertStringIncludes(error.message, "'L', 'W' or '#'");
  });

  it("refuses a schedule on a bus other than the default one", async () => {
    // Given a custom bus.
    const simAws = new SimAws();

    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // When a scheduled rule is put onto it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putRule(
        new PutRuleCommand({
          Name: "hourly",
          EventBusName: "orders",
          ScheduleExpression: "rate(1 hour)",
        }),
      );
    });

    // Then it is refused, as AWS refuses it: only the default bus takes one.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(
      error.message,
      "only allowed on the default event bus",
    );
  });
});

describe("EventBridge scheduled rule reporting", () => {
  it("reports a schedule back as it was written, and no pattern", async () => {
    // Given a scheduled rule.
    const simAws = new SimAws();

    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "hourly",
        ScheduleExpression: "rate(1 hour)",
      }),
    );

    // When it is described.
    const described = await simAws
      .eventBridge()
      .describeRule(new DescribeRuleCommand({ Name: "hourly" }));

    // Then the expression comes back as it was sent, and there is no pattern
    // to report rather than an empty one.
    assertIdentical(described.ScheduleExpression, "rate(1 hour)");
    assertUndefined(described.EventPattern);
    assertIdentical(described.State, "ENABLED");
  });

  it("lists a scheduled rule alongside a pattern rule", async () => {
    // Given one rule of each kind.
    const simAws = new SimAws();

    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "hourly",
        ScheduleExpression: "cron(0 12 * * ? *)",
      }),
    );
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: JSON.stringify({ source: ["orders.service"] }),
      }),
    );

    // When the bus is listed.
    const listed = await simAws
      .eventBridge()
      .listRules(new ListRulesCommand({}));

    // Then each reports what it was created with and nothing it was not.
    const [scheduled, patterned] = listed.Rules ?? [];

    assertArrayLength(listed.Rules ?? [], 2);
    assertNonNullable(scheduled);
    assertNonNullable(patterned);
    assertIdentical(scheduled.ScheduleExpression, "cron(0 12 * * ? *)");
    assertUndefined(scheduled.EventPattern);
    assertUndefined(patterned.ScheduleExpression);
  });
});

import {
  DeleteRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  type RuleState,
} from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

const startedAt = "2026-07-26T09:00:00.000Z";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

/**
 * A simulation started at a known instant, with a function recording the time
 * of every event it is handed.
 */
async function simulationWithTarget(): Promise<{
  readonly simAws: SimAws;
  readonly received: { time: string }[];
}> {
  const simAws = new SimAws({ clock: new SimFixedClock(new Date(startedAt)) });
  const received: { time: string }[] = [];

  await simAws.lambda().createFunction({
    input: {
      FunctionName: "reconcile",
      Role: "arn:aws:iam::888888888888:role/ReconcileRole",
      Code: {
        ZipFile: makeLambdaZipFileInput((event: unknown) => {
          received.push(event as { time: string });
          return { ok: true };
        }),
      },
    },
  });

  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: "reconcile",
      StatementId: "events",
      Action: "lambda:InvokeFunction",
      Principal: "events.amazonaws.com",
    }),
  );

  return { simAws, received };
}

/**
 * A scheduled rule, with the function as its target unless told otherwise.
 */
async function scheduledRule(
  simAws: SimAws,
  schedule: string,
  state?: RuleState,
): Promise<void> {
  await simAws.eventBridge().putRule(
    new PutRuleCommand({
      Name: "reconciliation",
      ScheduleExpression: schedule,
      State: state,
    }),
  );

  await simAws.eventBridge().putTargets(
    new PutTargetsCommand({
      Rule: "reconciliation",
      Targets: [{ Id: "reconcile", Arn: functionArn }],
    }),
  );
}

describe("EventBridge scheduled rules", () => {
  it("fires a rate rule once for every interval time passes", async () => {
    // Given an hourly rule with a function target.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 hour)");

    // When three simulated hours pass.
    await simAws.clock().advanceBy({ hours: 3 });

    // Then the function ran three times, each stamped with its own due
    // instant rather than with the instant the advance finished.
    assertArrayEquals(
      received.map((event) => event.time),
      ["2026-07-26T10:00:00Z", "2026-07-26T11:00:00Z", "2026-07-26T12:00:00Z"],
    );
  });

  it("fires per due instant rather than once per advance", async () => {
    // Given a rule due every minute.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 minute)");

    // When an hour passes in one step.
    await simAws.clock().advanceBy({ hours: 1 });

    // Then it fired sixty times, at sixty distinct instants, because that is
    // what an hour of that rule actually does.
    assertArrayLength(received, 60);
    assertArrayLength([...new Set(received.map((event) => event.time))], 60);
  });

  it("fires a cron rule at the instants it names", async () => {
    // Given the every-day-at-noon expression.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "cron(0 12 * * ? *)");

    // When three simulated days pass.
    await simAws.clock().advanceBy({ days: 3 });

    // Then it fired once a day at noon UTC.
    assertArrayEquals(
      received.map((event) => event.time),
      ["2026-07-26T12:00:00Z", "2026-07-27T12:00:00Z", "2026-07-28T12:00:00Z"],
    );
  });

  it("sends the scheduled event AWS sends", async () => {
    // Given an hourly rule that has fired once.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 hour)");
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the target got the standard envelope with an empty detail, naming
    // the rule that fired and the instant it was due.
    assertArrayLength(received, 1);
    assertObjectEquals(received[0], {
      version: "0",
      id: (received[0] as unknown as { id: string }).id,
      "detail-type": "Scheduled Event",
      source: "aws.events",
      account: "888888888888",
      time: "2026-07-26T10:00:00Z",
      region: "us-east-1",
      resources: ["arn:aws:events:us-east-1:888888888888:rule/reconciliation"],
      detail: {},
    });
  });

  it("does not fire while disabled, and does not replay on enabling", async () => {
    // Given an hourly rule created disabled.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 hour)", "DISABLED");

    // When three hours pass with it off, and one more with it back on.
    await simAws.clock().advanceBy({ hours: 3 });

    assertArrayEmpty(received);

    await simAws
      .eventBridge()
      .enableRule(new EnableRuleCommand({ Name: "reconciliation" }));

    await simAws.clock().advanceBy({ hours: 1 });

    // Then it fired once, for the interval it was on for, rather than four
    // times catching up on what it missed.
    assertArrayEquals(
      received.map((event) => event.time),
      ["2026-07-26T13:00:00Z"],
    );
  });

  it("stops firing once disabled again", async () => {
    // Given a rule that has fired.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 hour)");
    await simAws.clock().advanceBy({ hours: 1 });

    // When it is switched off and more time passes.
    await simAws
      .eventBridge()
      .disableRule(new DisableRuleCommand({ Name: "reconciliation" }));

    await simAws.clock().advanceBy({ hours: 3 });

    // Then nothing more arrived.
    assertArrayLength(received, 1);
  });

  it("stops firing when the rule is deleted", async () => {
    // Given a rule that has fired once.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 hour)");
    await simAws.clock().advanceBy({ hours: 1 });

    // When the rule is deleted and more time passes.
    await simAws
      .eventBridge()
      .deleteRule(new DeleteRuleCommand({ Name: "reconciliation" }));

    await simAws.clock().advanceBy({ hours: 3 });

    // Then nothing more arrived: the firing found itself out of date.
    assertArrayLength(received, 1);
  });

  it("reaches nothing once its targets are removed", async () => {
    // Given a rule that has fired once.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 hour)");
    await simAws.clock().advanceBy({ hours: 1 });

    // When its target is removed and more time passes.
    await simAws.eventBridge().removeTargets(
      new RemoveTargetsCommand({
        Rule: "reconciliation",
        Ids: ["reconcile"],
      }),
    );

    await simAws.clock().advanceBy({ hours: 3 });

    // Then the function was not invoked again.
    assertArrayLength(received, 1);
  });

  it("restarts the schedule when the rule is replaced", async () => {
    // Given an hourly rule, half an hour into its interval.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 hour)");
    await simAws.clock().advanceBy({ minutes: 30 });

    // When PutRule replaces it, which is a whole new rule of that name.
    await scheduledRule(simAws, "rate(1 hour)");

    await simAws.clock().advanceBy({ hours: 1 });

    // Then it fired an hour after the replacement rather than on the old
    // rule's timing, and the old rule fired not at all.
    assertArrayEquals(
      received.map((event) => event.time),
      ["2026-07-26T10:30:00Z"],
    );
  });

  it("records what it fired on the bus for a test with no target", async () => {
    // Given a rule with no target at all.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date(startedAt)),
    });

    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "reconciliation",
        ScheduleExpression: "rate(1 hour)",
      }),
    );

    // When two simulated hours pass.
    await simAws.clock().advanceBy({ hours: 2 });

    // Then the events it produced can still be seen, which is the simulator's
    // own accessor rather than anything real EventBridge offers.
    assertArrayEquals(
      simAws
        .eventBridge()
        .eventsOn("default")
        .map((event) => event.time.toISOString()),
      ["2026-07-26T10:00:00.000Z", "2026-07-26T11:00:00.000Z"],
    );
  });

  it("leaves a rule with only a schedule matching no event", async () => {
    // Given a scheduled rule and an event put onto its bus.
    const { simAws, received } = await simulationWithTarget();

    await scheduledRule(simAws, "rate(1 hour)");

    await simAws.eventBridge().putEvents({
      input: {
        Entries: [
          {
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: "{}",
          },
        ],
      },
    });

    await simAws.backgroundTasksComplete();

    // Then it went nowhere: a scheduled rule fires on its own timing and has
    // no pattern for an event to match.
    assertArrayEmpty(received);
  });
});

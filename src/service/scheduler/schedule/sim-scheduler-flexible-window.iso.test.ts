import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateScheduleCommand,
  type CreateScheduleCommandInput,
  DeleteScheduleCommand,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import {
  type SimRandom,
  SimSeededRandom,
} from "../../../util/random/sim-random.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

describe("Scheduler flexible time windows", () => {
  const startedAt = "2026-07-26T09:00:00.000Z";
  const functionArn =
    "arn:aws:lambda:us-east-1:888888888888:function:reconcile";
  const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

  /**
   * A simulation drawing from `random`, with a function that notes the
   * simulated instant of each invocation and a role allowed to invoke it.
   */
  async function simulationWithRole(random?: SimRandom): Promise<{
    readonly simAws: SimAws;
    readonly invokedAt: string[];
  }> {
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date(startedAt)),
      ...(random !== undefined && { random }),
    });
    const invokedAt: string[] = [];

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "reconcile",
        Role: "arn:aws:iam::888888888888:role/ReconcileRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            invokedAt.push(simAws.now().toISOString());
            return { ok: true };
          }),
        },
      },
    });

    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SchedulerRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "scheduler.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SchedulerRole",
        PolicyName: "InvokeReconcile",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource: functionArn,
          },
        }),
      }),
    );

    return { simAws, invokedAt };
  }

  /**
   * An hourly schedule with a fifteen minute flexible window.
   */
  function creation(
    overrides: Partial<CreateScheduleCommandInput> = {},
  ): CreateScheduleCommandInput {
    return {
      Name: "reconciliation",
      ScheduleExpression: "rate(1 hour)",
      FlexibleTimeWindow: { Mode: "FLEXIBLE", MaximumWindowInMinutes: 15 },
      Target: { Arn: functionArn, RoleArn: roleArn },
      ...overrides,
    };
  }

  /**
   * A source that always draws the same value, to place an invocation at a
   * known point in its window.
   */
  function always(value: number): SimRandom {
    return { next: (): number => value };
  }

  it("invokes once per occurrence by the time the window has closed", async () => {
    // Given an hourly schedule with a fifteen minute window, drawing from the
    // host's random source as a test normally would.
    const { simAws, invokedAt } = await simulationWithRole();

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    // When time passes the third due instant and the end of its window.
    await simAws.clock().advanceBy({ hours: 3, minutes: 15 });

    // Then each occurrence invoked exactly once, whatever was drawn.
    assertArrayLength(invokedAt, 3);
  });

  it("never invokes before the due time", async () => {
    // Given a window drawing its earliest possible moment.
    const { simAws, invokedAt } = await simulationWithRole(always(0));

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    // When time stops a millisecond short of the first due instant.
    await simAws.clock().advanceBy({ milliseconds: 3_599_999 });

    // Then nothing has been invoked yet.
    assertArrayEmpty(invokedAt);

    // And the invocation comes on the due instant itself.
    await simAws.clock().advanceBy({ milliseconds: 1 });

    assertObjectEquals(invokedAt, ["2026-07-26T10:00:00.000Z"]);
  });

  it("invokes at the drawn moment inside the window", async () => {
    // Given a window drawing the moment halfway through it.
    const { simAws, invokedAt } = await simulationWithRole(always(0.5));

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    // When the first occurrence's window has passed.
    await simAws.clock().advanceBy({ hours: 1, minutes: 15 });

    // Then it invoked seven and a half minutes after the due time.
    assertObjectEquals(invokedAt, ["2026-07-26T10:07:30.000Z"]);
  });

  it("closes the window before its last minute ends", async () => {
    // Given a window drawing the latest moment a source can give.
    const { simAws, invokedAt } = await simulationWithRole(
      always(1 - Number.EPSILON),
    );

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    // When time reaches the end of the first window.
    await simAws.clock().advanceBy({ hours: 1, minutes: 15 });

    // Then the invocation fell inside it rather than on its closing edge.
    assertObjectEquals(invokedAt, ["2026-07-26T10:14:59.999Z"]);
  });

  it("draws the same moments from the same seed", async () => {
    // Given two simulations seeded alike.
    const first = await simulationWithRole(new SimSeededRandom(2026));
    const second = await simulationWithRole(new SimSeededRandom(2026));

    // When each runs the same schedule for a few hours.
    await Promise.all(
      [first, second].map(async ({ simAws }) => {
        await simAws
          .scheduler()
          .createSchedule(new CreateScheduleCommand(creation()));
        await simAws.clock().advanceBy({ hours: 4, minutes: 15 });
      }),
    );

    // Then both invoked at the same instants.
    assertArrayLength(first.invokedAt, 4);
    assertObjectEquals(second.invokedAt, first.invokedAt);
  });

  it("keeps the schedule's own due times when the window delays an invocation", async () => {
    // Given a window drawing its latest moments.
    const { simAws, invokedAt } = await simulationWithRole(always(0.9));

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    // When two occurrences pass.
    await simAws.clock().advanceBy({ hours: 2, minutes: 15 });

    // Then the second is an hour after the first due time, not an hour after
    // the delayed invocation.
    assertObjectEquals(invokedAt, [
      "2026-07-26T10:13:30.000Z",
      "2026-07-26T11:13:30.000Z",
    ]);
  });

  it("does not invoke a schedule deleted while its window was open", async () => {
    // Given an occurrence waiting halfway into its window.
    const { simAws, invokedAt } = await simulationWithRole(always(0.5));

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));
    await simAws.clock().advanceBy({ hours: 1, minutes: 1 });

    // When the schedule is deleted before that moment comes.
    await simAws
      .scheduler()
      .deleteSchedule(new DeleteScheduleCommand({ Name: "reconciliation" }));
    await simAws.clock().advanceBy({ minutes: 15 });

    // Then nothing was invoked.
    assertArrayEmpty(invokedAt);
  });

  it("completes a one-time schedule once its delayed invocation is made", async () => {
    // Given a one-time schedule that deletes itself after completion.
    const { simAws, invokedAt } = await simulationWithRole(always(0.5));

    await simAws.scheduler().createSchedule(
      new CreateScheduleCommand(
        creation({
          ScheduleExpression: "at(2026-07-26T10:00:00)",
          ActionAfterCompletion: "DELETE",
        }),
      ),
    );

    // When its due time has passed but its invocation has not.
    await simAws.clock().advanceBy({ hours: 1, minutes: 1 });

    // Then it is still there.
    assertArrayLength(simAws.scheduler().allSchedules, 1);

    // And it goes once the invocation is made.
    await simAws.clock().advanceBy({ minutes: 14 });

    assertArrayLength(invokedAt, 1);
    assertArrayEmpty(simAws.scheduler().allSchedules);
  });

  it("reports the window back on GetSchedule", async () => {
    // Given a schedule created with a flexible window.
    const { simAws } = await simulationWithRole();

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    // When it is read back.
    const described = await simAws
      .scheduler()
      .getSchedule(new GetScheduleCommand({ Name: "reconciliation" }));

    // Then it carries the window it was created with.
    assertObjectEquals(described.FlexibleTimeWindow, {
      Mode: "FLEXIBLE",
      MaximumWindowInMinutes: 15,
    });
  });
});

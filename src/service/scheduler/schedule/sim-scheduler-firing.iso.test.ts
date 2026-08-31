import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateScheduleCommand,
  type CreateScheduleCommandInput,
  DeleteScheduleCommand,
  GetScheduleCommand,
  UpdateScheduleCommand,
} from "@aws-sdk/client-scheduler";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";
import { SimSchedulerResourceNotFoundException } from "../error/sim-scheduler.error.js";

const startedAt = "2026-07-26T09:00:00.000Z";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

/**
 * A simulation with a function to invoke and an execution role allowed to
 * invoke it, which is the least a working schedule needs.
 */
async function simulationWithRole(): Promise<{
  readonly simAws: SimAws;
  readonly invocations: unknown[];
}> {
  const simAws = new SimAws({ clock: new SimFixedClock(new Date(startedAt)) });
  const invocations: unknown[] = [];

  await simAws.lambda().createFunction({
    input: {
      FunctionName: "reconcile",
      Role: "arn:aws:iam::888888888888:role/ReconcileRole",
      Code: {
        ZipFile: makeLambdaZipFileInput((event: unknown) => {
          invocations.push(event);
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

  return { simAws, invocations };
}

/**
 * The request every schedule here is made with.
 */
function creation(
  overrides: Partial<CreateScheduleCommandInput> = {},
): CreateScheduleCommandInput {
  return {
    Name: "reconciliation",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: { Arn: functionArn, RoleArn: roleArn },
    ...overrides,
  };
}

describe("Scheduler firing on the clock", () => {
  it("invokes a rate target once per due instant as time advances", async () => {
    // Given an hourly schedule.
    const { simAws, invocations } = await simulationWithRole();

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    // When three simulated hours pass.
    await simAws.clock().advanceBy({ hours: 3 });

    // Then it invoked three times rather than once at the end.
    assertArrayLength(invocations, 3);
  });

  it("fires per due instant rather than once per advance", async () => {
    // Given a schedule due every minute.
    const { simAws, invocations } = await simulationWithRole();

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(
          creation({ ScheduleExpression: "rate(1 minute)" }),
        ),
      );

    // When an hour passes in one step.
    await simAws.clock().advanceBy({ hours: 1 });

    assertArrayLength(invocations, 60);
  });

  it("fires a one-time schedule once, and never again", async () => {
    // Given an at() schedule for later the same day.
    const { simAws, invocations } = await simulationWithRole();

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(
          creation({ ScheduleExpression: "at(2026-07-26T10:00:00)" }),
        ),
      );

    // When time runs well past it.
    await simAws.clock().advanceBy({ days: 3 });

    // Then it invoked exactly once, and the schedule is still there, because
    // ActionAfterCompletion defaults to NONE.
    assertArrayLength(invocations, 1);

    const described = await simAws
      .scheduler()
      .getSchedule(new GetScheduleCommand({ Name: "reconciliation" }));

    assertIdentical(described.Name, "reconciliation");
  });

  it("deletes a completed schedule when asked to", async () => {
    // Given a one-time schedule that cleans up after itself.
    const { simAws, invocations } = await simulationWithRole();

    await simAws.scheduler().createSchedule(
      new CreateScheduleCommand(
        creation({
          ScheduleExpression: "at(2026-07-26T10:00:00)",
          ActionAfterCompletion: "DELETE",
        }),
      ),
    );

    // When it has fired.
    await simAws.clock().advanceBy({ hours: 2 });

    assertArrayLength(invocations, 1);

    // Then it is gone.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .getSchedule(new GetScheduleCommand({ Name: "reconciliation" }));
    });

    assertInstanceOf(error, SimSchedulerResourceNotFoundException);
  });

  it("does not fire while disabled, and resumes on being enabled", async () => {
    // Given a schedule created disabled.
    const { simAws, invocations } = await simulationWithRole();

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(creation({ State: "DISABLED" })),
      );

    await simAws.clock().advanceBy({ hours: 3 });

    assertArrayEmpty(invocations);

    // When an update enables it and one more hour passes.
    await simAws
      .scheduler()
      .updateSchedule(
        new UpdateScheduleCommand(creation({ State: "ENABLED" })),
      );

    await simAws.clock().advanceBy({ hours: 1 });

    // Then it fired once, rather than catching up on what it missed.
    assertArrayLength(invocations, 1);
  });

  it("reschedules from the new expression on an update", async () => {
    // Given an hourly schedule, half an hour in.
    const { simAws, invocations } = await simulationWithRole();

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    await simAws.clock().advanceBy({ minutes: 30 });

    // When it becomes a ten minute schedule.
    await simAws
      .scheduler()
      .updateSchedule(
        new UpdateScheduleCommand(
          creation({ ScheduleExpression: "rate(10 minutes)" }),
        ),
      );

    await simAws.clock().advanceBy({ minutes: 30 });

    // Then it fired on the new expression's timing, three times, rather than
    // once on the old one's.
    assertArrayLength(invocations, 3);
  });

  it("stops firing when the schedule is deleted", async () => {
    // Given a schedule that has fired once.
    const { simAws, invocations } = await simulationWithRole();

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()));

    await simAws.clock().advanceBy({ hours: 1 });

    // When it is deleted and more time passes.
    await simAws
      .scheduler()
      .deleteSchedule(new DeleteScheduleCommand({ Name: "reconciliation" }));

    await simAws.clock().advanceBy({ hours: 3 });

    assertArrayLength(invocations, 1);
  });

  it("hands the target its input, and an empty event without one", async () => {
    // Given two schedules, one with an Input and one without.
    const { simAws, invocations } = await simulationWithRole();

    const withInput = creation({
      Name: "with-input",
      ScheduleExpression: "at(2026-07-26T10:00:00)",
      Target: {
        Arn: functionArn,
        RoleArn: roleArn,
        Input: JSON.stringify({ wake: "up" }),
      },
    });

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(withInput));
    const withoutInput = creation({
      Name: "without-input",
      ScheduleExpression: "at(2026-07-26T11:00:00)",
    });

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(withoutInput));

    await simAws.clock().advanceBy({ hours: 3 });

    // Then the first got its input and the second got an empty event, which is
    // what AWS documents for a schedule with no payload.
    assertArrayLength(invocations, 2);
    assertObjectEquals(invocations[0], { wake: "up" });
    assertObjectEquals(invocations[1], {});
  });
});

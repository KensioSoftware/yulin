import {
  CreateScheduleCommand,
  type CreateScheduleCommandInput,
  DeleteScheduleCommand,
  GetScheduleCommand,
  ListSchedulesCommand,
  UpdateScheduleCommand,
} from "@aws-sdk/client-scheduler";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSchedulerConflictException,
  SimSchedulerResourceNotFoundException,
} from "../../error/sim-scheduler.error.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

/**
 * The properties every schedule here carries, so a test names only what it is
 * about.
 */
function schedule(
  overrides: Partial<CreateScheduleCommandInput> = {},
): CreateScheduleCommandInput {
  return {
    Name: "nightly-report",
    ScheduleExpression: "cron(0 2 * * ? *)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: { Arn: functionArn, RoleArn: roleArn },
    ...overrides,
  };
}

describe("Scheduler schedule commands", () => {
  it("creates a schedule and reports its ARN with its group in it", async () => {
    // Given a simulation with no schedules.
    const simAws = new SimAws();

    // When one is created.
    const created = await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(schedule()));

    // Then its ARN names the default group, which a schedule ARN always
    // carries, unlike an EventBridge rule ARN.
    assertIdentical(
      created.ScheduleArn,
      "arn:aws:scheduler:us-east-1:888888888888:schedule/default/nightly-report",
    );
  });

  it("describes a schedule as it was written", async () => {
    // Given a schedule created at a known instant.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(
          schedule({ Description: "The nightly reconciliation" }),
        ),
      );

    // When it is described.
    const described = await simAws
      .scheduler()
      .getSchedule(new GetScheduleCommand({ Name: "nightly-report" }));

    // Then everything comes back as it was sent, stamped from the
    // simulation's own clock.
    assertIdentical(described.ScheduleExpression, "cron(0 2 * * ? *)");
    assertIdentical(described.State, "ENABLED");
    assertIdentical(described.ActionAfterCompletion, "NONE");
    assertIdentical(described.Description, "The nightly reconciliation");
    assertIdentical(described.Target?.RoleArn, roleArn);
    assertIdentical(
      described.CreationDate?.toISOString(),
      "2026-07-26T09:00:00.000Z",
    );
  });

  it("refuses to create a schedule that already exists", async () => {
    // Given a schedule that has been created.
    const simAws = new SimAws();

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(schedule()));

    // When the same request is made again.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .createSchedule(new CreateScheduleCommand(schedule()));
    });

    // Then it conflicts rather than replacing it, which is the difference
    // between this and EventBridge's PutRule.
    assertInstanceOf(error, SimSchedulerConflictException);
  });

  it("replaces the whole schedule on an update", async () => {
    // Given a schedule with a description.
    const simAws = new SimAws();

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(schedule({ Description: "Nightly" })),
      );

    // When it is updated without one.
    await simAws
      .scheduler()
      .updateSchedule(
        new UpdateScheduleCommand(
          schedule({ ScheduleExpression: "rate(30 minutes)" }),
        ),
      );

    // Then the description is gone: an update replaces rather than merges,
    // which is real behaviour and a common surprise.
    const described = await simAws
      .scheduler()
      .getSchedule(new GetScheduleCommand({ Name: "nightly-report" }));

    assertIdentical(described.ScheduleExpression, "rate(30 minutes)");
    assertUndefined(described.Description);
  });

  it("refuses to update a schedule that is not there", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .updateSchedule(new UpdateScheduleCommand(schedule()));
    });

    // An update is not a create, unlike PutRule on an EventBridge rule.
    assertInstanceOf(error, SimSchedulerResourceNotFoundException);
  });

  it("deletes a schedule, and refuses to delete one twice", async () => {
    // Given a schedule that has been deleted.
    const simAws = new SimAws();

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(schedule()));
    await simAws
      .scheduler()
      .deleteSchedule(new DeleteScheduleCommand({ Name: "nightly-report" }));

    // When it is deleted again.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .deleteSchedule(new DeleteScheduleCommand({ Name: "nightly-report" }));
    });

    // Then it is a not-found, unlike EventBridge's DeleteRule, which succeeds.
    assertInstanceOf(error, SimSchedulerResourceNotFoundException);
  });

  it("lists schedules, narrowed by name prefix and state", async () => {
    // Given three schedules, one of them disabled.
    const simAws = new SimAws();

    await Promise.all(
      (
        [
          ["nightly-report", "ENABLED"],
          ["nightly-sweep", "DISABLED"],
          ["hourly-poll", "ENABLED"],
        ] as const
      ).map(
        async ([name, state]) =>
          await simAws
            .scheduler()
            .createSchedule(
              new CreateScheduleCommand(schedule({ Name: name, State: state })),
            ),
      ),
    );

    // When the enabled ones beginning with "nightly" are listed.
    const listed = await simAws
      .scheduler()
      .listSchedules(
        new ListSchedulesCommand({ NamePrefix: "nightly", State: "ENABLED" }),
      );

    // Then only the one matching both comes back, and a listing carries the
    // target's ARN without the expression, as real Scheduler's does.
    assertArrayLength(listed.Schedules ?? [], 1);

    const [only] = listed.Schedules ?? [];

    assertNonNullable(only);
    assertIdentical(only.Name, "nightly-report");
    assertIdentical(only.Target.Arn, functionArn);
  });
});

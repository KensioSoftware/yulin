import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  GetScheduleCommand,
  ListSchedulesCommand,
} from "@aws-sdk/client-scheduler";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimSchedulerResourceNotFoundException } from "../error/sim-scheduler.error.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

/**
 * A schedule in a group, so each test names only what it is about.
 */
function schedule(
  name: string,
  groupName?: string,
): ConstructorParameters<typeof CreateScheduleCommand>[0] {
  return {
    Name: name,
    GroupName: groupName,
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: { Arn: functionArn, RoleArn: roleArn },
  };
}

/**
 * A simulation with one group of its own beside `default`.
 */
async function simAwsWithGroup(groupName: string): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .scheduler()
    .createScheduleGroup(new CreateScheduleGroupCommand({ Name: groupName }));

  return simAws;
}

describe("Scheduler schedules in a group", () => {
  it("puts the group in the schedule's ARN", async () => {
    // Given a group of its own.
    const simAws = await simAwsWithGroup("analytics");

    // When a schedule goes in it.
    const created = await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(schedule("rollup", "analytics")),
      );

    // Then the ARN names the group it is actually in, which is why a schedule
    // could not be quietly moved into default.
    assertIdentical(
      created.ScheduleArn,
      "arn:aws:scheduler:us-east-1:888888888888:schedule/analytics/rollup",
    );
  });

  it("keeps a name unique per group rather than per Account", async () => {
    // Given two groups, as two deployments of one construct would have.
    const simAws = await simAwsWithGroup("live");

    await simAws
      .scheduler()
      .createScheduleGroup(new CreateScheduleGroupCommand({ Name: "test" }));

    // When both create a schedule of the same name.
    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(schedule("rollup", "live")));

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(schedule("rollup", "test")));

    // Then neither collided, which is the whole reason groups exist.
    assertArrayLength(simAws.scheduler().allSchedules, 2);
  });

  it("lists only the schedules of the group asked for", async () => {
    // Given a schedule in a group and another in default.
    const simAws = await simAwsWithGroup("analytics");

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(schedule("rollup", "analytics")),
      );

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(schedule("reconcile")));

    // When one group is listed.
    const listed = await simAws
      .scheduler()
      .listSchedules(new ListSchedulesCommand({ GroupName: "analytics" }));

    // Then the other group's schedule is not in it.
    const schedules = listed.Schedules ?? [];

    assertArrayLength(schedules, 1);
    assertIdentical(schedules[0].Name, "rollup");
    assertIdentical(schedules[0].GroupName, "analytics");
  });

  it("does not find a grouped schedule in the default group", async () => {
    // Given a schedule in a group of its own.
    const simAws = await simAwsWithGroup("analytics");

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(schedule("rollup", "analytics")),
      );

    // When it is read without naming the group.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .getSchedule(new GetScheduleCommand({ Name: "rollup" }));
    });

    // Then it is not there, because a schedule belongs to one group.
    assertInstanceOf(error, SimSchedulerResourceNotFoundException);
  });

  it("refuses a listing for a group that does not exist", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .listSchedules(new ListSchedulesCommand({ GroupName: "analytics" }));
    });

    assertInstanceOf(error, SimSchedulerResourceNotFoundException);
  });
});

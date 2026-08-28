import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleGroupCommand,
  GetScheduleGroupCommand,
  ListScheduleGroupsCommand,
} from "@aws-sdk/client-scheduler";
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

import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSchedulerConflictException,
  SimSchedulerResourceNotFoundException,
  SimSchedulerUnsimulatedInputException,
  SimSchedulerValidationException,
} from "../../error/sim-scheduler.error.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

/**
 * A schedule in a group, so each test names only what it is about.
 */
function schedule(
  name: string,
  groupName: string,
): ConstructorParameters<typeof CreateScheduleCommand>[0] {
  return {
    Name: name,
    GroupName: groupName,
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: { Arn: functionArn, RoleArn: roleArn },
  };
}

describe("Scheduler schedule group commands", () => {
  it("creates a group and reports its own ARN", async () => {
    // Given a simulation with no groups of its own.
    const simAws = new SimAws();

    // When one is created.
    const created = await simAws
      .scheduler()
      .createScheduleGroup(
        new CreateScheduleGroupCommand({ Name: "analytics" }),
      );

    // Then its ARN is a schedule-group ARN, which is a different resource
    // path from the schedule/<group>/<name> a schedule carries.
    assertIdentical(
      created.ScheduleGroupArn,
      "arn:aws:scheduler:us-east-1:888888888888:schedule-group/analytics",
    );
  });

  it("comes with the default group nobody created", async () => {
    // Given a simulation nothing has been asked of.
    const simAws = new SimAws();

    // When its groups are listed.
    const listed = await simAws
      .scheduler()
      .listScheduleGroups(new ListScheduleGroupsCommand({}));

    // Then default is already there, as it is in every Account.
    const groups = listed.ScheduleGroups ?? [];

    assertArrayLength(groups, 1);
    assertIdentical(groups[0].Name, "default");
    assertIdentical(groups[0].State, "ACTIVE");
  });

  it("describes a group as the simulation's clock stamped it", async () => {
    // Given a group created at a known instant.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });

    await simAws
      .scheduler()
      .createScheduleGroup(
        new CreateScheduleGroupCommand({ Name: "analytics" }),
      );

    // When it is described.
    const described = await simAws
      .scheduler()
      .getScheduleGroup(new GetScheduleGroupCommand({ Name: "analytics" }));

    // Then it comes back stamped from the simulation's own clock.
    assertIdentical(described.State, "ACTIVE");
    assertIdentical(
      described.CreationDate?.toISOString(),
      "2026-07-26T09:00:00.000Z",
    );
    assertIdentical(
      described.LastModificationDate?.toISOString(),
      "2026-07-26T09:00:00.000Z",
    );
  });

  it("refuses to create a group that already exists", async () => {
    // Given a group that has been created.
    const simAws = new SimAws();

    await simAws
      .scheduler()
      .createScheduleGroup(
        new CreateScheduleGroupCommand({ Name: "analytics" }),
      );

    // When the same request is made again.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .createScheduleGroup(
          new CreateScheduleGroupCommand({ Name: "analytics" }),
        );
    });

    // Then it conflicts rather than replacing it.
    assertInstanceOf(error, SimSchedulerConflictException);
  });

  it("refuses group tags rather than dropping them", async () => {
    // Given a group asking to be tagged, which is what AWS says groups are
    // for, and what nothing here reads back.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.scheduler().createScheduleGroup(
        new CreateScheduleGroupCommand({
          Name: "analytics",
          Tags: [{ Key: "team", Value: "analytics" }],
        }),
      );
    });

    assertInstanceOf(error, SimSchedulerUnsimulatedInputException);
    assertStringIncludes(error.message, "Schedule group tags");
  });

  it("narrows a listing by name prefix, in creation order", async () => {
    // Given three groups beside the default one, created in this order.
    const simAws = new SimAws();

    await simAws
      .scheduler()
      .createScheduleGroup(
        new CreateScheduleGroupCommand({ Name: "reporting-live" }),
      );

    await simAws
      .scheduler()
      .createScheduleGroup(
        new CreateScheduleGroupCommand({ Name: "reporting-test" }),
      );

    await simAws
      .scheduler()
      .createScheduleGroup(new CreateScheduleGroupCommand({ Name: "billing" }));

    // When the reporting ones are listed.
    const listed = await simAws
      .scheduler()
      .listScheduleGroups(
        new ListScheduleGroupsCommand({ NamePrefix: "reporting-" }),
      );

    // Then only those two come back, in the order they were created.
    const groups = listed.ScheduleGroups ?? [];

    assertArrayLength(groups, 2);
    assertIdentical(groups[0].Name, "reporting-live");
    assertIdentical(groups[1].Name, "reporting-test");
  });

  it("deletes a group and the schedules still in it", async () => {
    // Given a group holding a schedule.
    const simAws = new SimAws();

    await simAws
      .scheduler()
      .createScheduleGroup(
        new CreateScheduleGroupCommand({ Name: "analytics" }),
      );

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(schedule("rollup", "analytics")),
      );

    // When the group is deleted.
    await simAws
      .scheduler()
      .deleteScheduleGroup(
        new DeleteScheduleGroupCommand({ Name: "analytics" }),
      );

    // Then the schedule went with it, as it does on AWS, rather than the
    // deletion being refused for the group not being empty.
    assertUndefined(simAws.scheduler().findScheduleGroup("analytics"));
    assertUndefined(simAws.scheduler().findSchedule("rollup", "analytics"));
  });

  it("leaves the schedules of other groups alone", async () => {
    // Given a schedule of the same name in two groups.
    const simAws = new SimAws();

    await simAws
      .scheduler()
      .createScheduleGroup(new CreateScheduleGroupCommand({ Name: "live" }));

    await simAws
      .scheduler()
      .createScheduleGroup(new CreateScheduleGroupCommand({ Name: "test" }));

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(schedule("rollup", "live")));

    await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(schedule("rollup", "test")));

    // When one group goes.
    await simAws
      .scheduler()
      .deleteScheduleGroup(new DeleteScheduleGroupCommand({ Name: "test" }));

    // Then the other group's schedule of that name is untouched, which is the
    // whole reason for having a group per deployment.
    assertNonNullable(simAws.scheduler().findSchedule("rollup", "live"));
    assertUndefined(simAws.scheduler().findSchedule("rollup", "test"));
  });

  it("refuses to delete the default group", async () => {
    // Given a simulation with only the group every Account comes with.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .deleteScheduleGroup(
          new DeleteScheduleGroupCommand({ Name: "default" }),
        );
    });

    // Then it is refused: nothing here could create it again, and every
    // request naming no group wants it.
    assertInstanceOf(error, SimSchedulerValidationException);
    assertStringIncludes(error.message, "cannot be deleted");
  });

  it("refuses a group that is not there", async () => {
    const simAws = new SimAws();

    const missing = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .getScheduleGroup(new GetScheduleGroupCommand({ Name: "analytics" }));
    });

    assertInstanceOf(missing, SimSchedulerResourceNotFoundException);
  });
});

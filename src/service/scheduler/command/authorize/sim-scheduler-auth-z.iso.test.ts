import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  GetScheduleCommand,
  ListSchedulesCommand,
} from "@aws-sdk/client-scheduler";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSchedulerAccessDeniedException } from "../../error/sim-scheduler.error.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

const executionRoleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

const scheduleArn =
  "arn:aws:scheduler:us-east-1:888888888888:schedule/default/nightly-report";

/**
 * A simulated AWS and a Role allowed only what one policy statement says.
 */
async function simAwsWithRole(
  statement: object | readonly object[],
): Promise<{ simAws: SimAws; caller: SimAwsCaller }> {
  const simAws = new SimAws();

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "ScheduleAdministrator",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "ScheduleAdministrator",
      PolicyName: "ManageSchedules",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return { simAws, caller: { kind: "arn", arn: role.Role.Arn } };
}

/**
 * The request every test here makes, so each names only what it is about.
 */
function creation(): ConstructorParameters<typeof CreateScheduleCommand>[0] {
  return {
    Name: "nightly-report",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: { Arn: functionArn, RoleArn: executionRoleArn },
  };
}

describe("Scheduler IAM authorization", () => {
  it("admits a caller whose policy names the schedule ARN", async () => {
    // Given a Role allowed to create one schedule, named with its group, and
    // to pass the execution role that schedule fires as.
    const { simAws, caller } = await simAwsWithRole([
      {
        Effect: "Allow",
        Action: "scheduler:CreateSchedule",
        Resource: scheduleArn,
      },
      { Effect: "Allow", Action: "iam:PassRole", Resource: executionRoleArn },
    ]);

    // When it creates that schedule.
    const created = await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()), { caller });

    // Then it is allowed.
    assertIdentical(created.ScheduleArn, scheduleArn);
  });

  it("refuses a caller whose policy leaves the group out of the ARN", async () => {
    // Given a policy naming the schedule without its group, which is the
    // shape an EventBridge rule ARN has and a schedule ARN does not.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "scheduler:CreateSchedule",
      Resource:
        "arn:aws:scheduler:us-east-1:888888888888:schedule/nightly-report",
    });

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .createSchedule(new CreateScheduleCommand(creation()), { caller });
    });

    // Then it matches nothing, here as on real AWS.
    assertInstanceOf(error, SimSchedulerAccessDeniedException);
    assertStringIncludes(error.message, "scheduler:CreateSchedule");
  });

  it("refuses a caller with no permission before looking the schedule up", async () => {
    // Given a Role allowed to create but not to read.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "scheduler:CreateSchedule",
      Resource: "*",
    });

    // When it reads a schedule that does not exist.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .getSchedule(new GetScheduleCommand({ Name: "missing" }), { caller });
    });

    // Then it is refused for the permission rather than told the schedule is
    // missing, which is the order every command in the simulation uses.
    assertInstanceOf(error, SimSchedulerAccessDeniedException);
    assertStringIncludes(error.message, "scheduler:GetSchedule");
  });

  it("authorizes a group command against the group's own ARN", async () => {
    // Given a Role allowed to create one group, named by its schedule-group
    // ARN, which is a different resource path from a schedule's.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "scheduler:CreateScheduleGroup",
      Resource:
        "arn:aws:scheduler:us-east-1:888888888888:schedule-group/analytics",
    });

    // When it creates that group, and then another.
    const created = await simAws
      .scheduler()
      .createScheduleGroup(
        new CreateScheduleGroupCommand({ Name: "analytics" }),
        { caller },
      );

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .createScheduleGroup(
          new CreateScheduleGroupCommand({ Name: "billing" }),
          { caller },
        );
    });

    // Then only the one its policy names is allowed.
    assertIdentical(
      created.ScheduleGroupArn,
      "arn:aws:scheduler:us-east-1:888888888888:schedule-group/analytics",
    );
    assertInstanceOf(error, SimSchedulerAccessDeniedException);
    assertStringIncludes(error.message, "scheduler:CreateScheduleGroup");
  });

  it("authorizes a listing against every schedule rather than one", async () => {
    // Given a Role allowed to list only one schedule by ARN.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "scheduler:ListSchedules",
      Resource: scheduleArn,
    });

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .scheduler()
        .listSchedules(new ListSchedulesCommand({}), { caller });
    });

    // Then the listing is refused: it names no schedule, so only a policy
    // whose Resource is * allows it, here as on AWS.
    assertInstanceOf(error, SimSchedulerAccessDeniedException);
  });
});

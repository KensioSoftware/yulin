import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { SimSchedulerAccessDeniedException } from "../../error/sim-scheduler.error.js";

const executionRoleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

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

describe("passing an execution role to Scheduler CreateSchedule", () => {
  it("refuses a caller that may write a schedule and may not pass its role", async () => {
    // Given a Role allowed to write schedules and nothing else.
    const simAws = new SimAws();
    const writer = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Writer",
        policyName: "WriteSchedules",
        actions: ["scheduler:CreateSchedule"],
      },
      simAws,
    );

    // When it creates a schedule that fires as an execution role.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.scheduler().createSchedule(new CreateScheduleCommand(creation()), {
        caller: { kind: "arn", arn: writer.Arn },
      }),
    );

    // Then Scheduler reports its own AccessDeniedException, naming the Role
    // the schedule would have fired as.
    assertInstanceOf(error, SimSchedulerAccessDeniedException);
    assertStringIncludes(error.message, "iam:PassRole");
    assertStringIncludes(error.message, executionRoleArn);
    assertStringIncludes(error.message, writer.Arn);
    assertUndefined(simAws.scheduler().findSchedule("nightly-report"));
  });

  it("creates for a caller allowed to pass a role to Scheduler", async () => {
    // Given the same Role, also allowed to pass a role to scheduler.
    const simAws = new SimAws();
    const writer = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Writer",
        policyName: "WriteSchedules",
        actions: ["scheduler:CreateSchedule"],
      },
      simAws,
    );

    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "Writer",
        PolicyName: "PassExecutionRole",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "iam:PassRole",
            Resource: executionRoleArn,
            Condition: {
              StringEquals: {
                "iam:PassedToService": "scheduler.amazonaws.com",
              },
            },
          },
        }),
      },
    });

    // When it creates the schedule.
    const created = await simAws
      .scheduler()
      .createSchedule(new CreateScheduleCommand(creation()), {
        caller: { kind: "arn", arn: writer.Arn },
      });

    // Then the condition matched and the schedule is there.
    assertStringIncludes(
      created.ScheduleArn,
      "schedule/default/nightly-report",
    );
  });
});

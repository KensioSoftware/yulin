import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:report";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

/**
 * A simulation with a function to invoke and a role allowed to invoke it.
 */
async function simAwsWithRole(): Promise<{
  readonly simAws: SimAws;
  readonly runs: unknown[];
}> {
  const simAws = new SimAws({
    clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
  });
  const runs: unknown[] = [];

  await simAws.lambda().createFunction({
    input: {
      FunctionName: "report",
      Role: "arn:aws:iam::888888888888:role/ReportRole",
      Code: {
        ZipFile: makeLambdaZipFileInput(() => {
          runs.push(1);
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
      PolicyName: "InvokeReport",
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

  return { simAws, runs };
}

/**
 * A group and a schedule that names it by Ref, which is what CDK writes.
 */
function groupedSchedule(
  groupProperties: Record<string, SimCfnTemplateValue> = {},
): Record<string, SimCfnTemplateValue> {
  return {
    ReportGroup: {
      Type: "AWS::Scheduler::ScheduleGroup",
      Properties: { Name: "analytics", ...groupProperties },
    },
    HourlyReport: {
      Type: "AWS::Scheduler::Schedule",
      Properties: {
        Name: "hourly-report",
        GroupName: { Ref: "ReportGroup" },
        ScheduleExpression: "rate(1 hour)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: { Arn: functionArn, RoleArn: roleArn },
      },
    },
  };
}

describe("Scheduler CloudFormation ScheduleGroup deployment", () => {
  it("deploys a group and puts the stack's schedule in it", async () => {
    // Given a template declaring a group and a schedule that names it.
    const { simAws, runs } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: { Resources: groupedSchedule() },
    });

    await stack.waitForDeployComplete();

    // Then the schedule is in the group, with the group in its ARN, and it
    // fires as any other schedule does.
    const schedule = simAws
      .scheduler()
      .findSchedule("hourly-report", "analytics");

    assertNonNullable(simAws.scheduler().findScheduleGroup("analytics"));
    assertNonNullable(schedule);
    assertIdentical(
      schedule.arn,
      "arn:aws:scheduler:us-east-1:888888888888:schedule/analytics/hourly-report",
    );

    await simAws.clock().advanceBy({ hours: 3 });

    assertArrayLength(runs, 3);
  });

  it("resolves the group's ARN through Fn::GetAtt", async () => {
    // Given a template reading the group's ARN back out, which is how an
    // execution role policy names every schedule the group will ever hold.
    const { simAws } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: {
        Resources: groupedSchedule(),
        Outputs: {
          GroupArn: { Value: { "Fn::GetAtt": ["ReportGroup", "Arn"] } },
          GroupName: { Value: { Ref: "ReportGroup" } },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the attribute is the group's own schedule-group ARN, and a Ref is
    // its name.
    assertIdentical(
      stack.output("GroupArn"),
      "arn:aws:scheduler:us-east-1:888888888888:schedule-group/analytics",
    );
    assertIdentical(stack.output("GroupName"), "analytics");
  });

  it("names an unnamed group after the stack and logical id", async () => {
    const { simAws } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: {
        Resources: {
          ReportGroup: { Type: "AWS::Scheduler::ScheduleGroup" },
        },
      },
    });

    await stack.waitForDeployComplete();

    const [, generated] = simAws.scheduler().allScheduleGroups;

    assertNonNullable(generated);
    assertStringIncludes(generated.name, "reporting-stack");
  });

  it("deploys a tagged group, recording the tags it was created without", async () => {
    // Given a group carrying tags, which is what CDK puts on one when the
    // stack is tagged.
    const { simAws } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: {
        Resources: groupedSchedule({
          Tags: [{ Key: "team", Value: "analytics" }],
        }),
      },
    });

    await stack.waitForDeployComplete();

    // Then the group is there, and the omission is on the record rather than
    // having failed a stack over a property nothing reads.
    const ignored = stack
      .getResource("ReportGroup")
      ?.ignoredProperties.find((property) => property.path === "Tags");

    assertNonNullable(simAws.scheduler().findScheduleGroup("analytics"));
    assertNonNullable(ignored);
    assertStringIncludes(ignored.reason, "no simulated service reads");
  });

  it("tears down a stack whose schedule names its group by name", async () => {
    // Given a template naming the group as a string, so nothing tells
    // CloudFormation the schedule depends on it and the group may come down
    // first, taking the schedule with it.
    const { simAws } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: {
        Resources: {
          ReportGroup: {
            Type: "AWS::Scheduler::ScheduleGroup",
            Properties: { Name: "analytics" },
          },
          HourlyReport: {
            Type: "AWS::Scheduler::Schedule",
            Properties: {
              Name: "hourly-report",
              GroupName: "analytics",
              ScheduleExpression: "rate(1 hour)",
              FlexibleTimeWindow: { Mode: "OFF" },
              Target: { Arn: functionArn, RoleArn: roleArn },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then the teardown finished rather than failing on a schedule that had
    // already gone with its group.
    assertUndefined(simAws.scheduler().findScheduleGroup("analytics"));
    assertArrayEmpty(simAws.scheduler().allSchedules);
  });

  it("removes the group and its schedules when the stack comes down", async () => {
    // Given a deployed group holding a schedule.
    const { simAws, runs } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: { Resources: groupedSchedule() },
    });

    await stack.waitForDeployComplete();

    // When the stack is torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then both are gone, and time passing fires nothing.
    assertUndefined(simAws.scheduler().findScheduleGroup("analytics"));
    assertUndefined(
      simAws.scheduler().findSchedule("hourly-report", "analytics"),
    );

    await simAws.clock().advanceBy({ hours: 3 });

    assertArrayEmpty(runs);
  });
});

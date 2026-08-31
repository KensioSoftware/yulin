import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

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
 * The schedule Resource these templates declare.
 */
function scheduleResource(
  properties: Record<string, SimCfnTemplateValue> = {},
): SimCfnTemplateValue {
  return {
    Type: "AWS::Scheduler::Schedule",
    Properties: {
      Name: "hourly-report",
      ScheduleExpression: "rate(1 hour)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: { Arn: functionArn, RoleArn: roleArn },
      ...properties,
    },
  };
}

describe("Scheduler CloudFormation Schedule deployment", () => {
  it("deploys a schedule that fires as the clock advances", async () => {
    // Given a template declaring a schedule.
    const { simAws, runs } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: { Resources: { HourlyReport: scheduleResource() } },
    });

    await stack.waitForDeployComplete();

    // When three simulated hours pass, with no further SDK setup.
    await simAws.clock().advanceBy({ hours: 3 });

    // Then the target ran three times, so the schedule deployed and armed.
    assertArrayLength(runs, 3);
  });

  it("resolves the target ARN and role from the same template", async () => {
    // Given a template whose schedule targets a queue it also declares.
    const { simAws } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: {
        Resources: {
          ReportQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "reports" },
          },
          HourlyReport: scheduleResource({
            Target: {
              Arn: { "Fn::GetAtt": ["ReportQueue", "Arn"] },
              RoleArn: roleArn,
            },
          }),
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the schedule carries the queue's real ARN.
    const schedule = simAws.scheduler().findSchedule("hourly-report");

    assertNonNullable(schedule);
    assertIdentical(
      schedule.target.arn.value,
      "arn:aws:sqs:us-east-1:888888888888:reports",
    );
  });

  it("names an unnamed schedule after the stack and logical id", async () => {
    const { simAws } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: {
        Resources: {
          HourlyReport: {
            Type: "AWS::Scheduler::Schedule",
            Properties: {
              ScheduleExpression: "rate(1 hour)",
              FlexibleTimeWindow: { Mode: "OFF" },
              Target: { Arn: functionArn, RoleArn: roleArn },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    const [schedule] = simAws.scheduler().allSchedules;

    assertNonNullable(schedule);
    assertStringIncludes(schedule.name.value, "reporting-stack");
  });

  it("refuses a property it does not model, naming the Resource", async () => {
    // Given a schedule asking for a flexible window.
    const { simAws } = await simAwsWithRole();

    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "reporting-stack",
        template: {
          Resources: {
            HourlyReport: scheduleResource({
              FlexibleTimeWindow: {
                Mode: "FLEXIBLE",
                MaximumWindowInMinutes: 15,
              },
            }),
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    assertStringIncludes(error.message, "HourlyReport");
    assertStringIncludes(error.message, "FLEXIBLE");
  });

  it("removes the schedules a stack created", async () => {
    // Given a deployed schedule.
    const { simAws, runs } = await simAwsWithRole();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reporting-stack",
      template: { Resources: { HourlyReport: scheduleResource() } },
    });

    await stack.waitForDeployComplete();

    // When the stack is torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then it is gone, and time passing fires nothing.
    assertUndefined(simAws.scheduler().findSchedule("hourly-report"));

    await simAws.clock().advanceBy({ hours: 3 });

    assertArrayEmpty(runs);
  });
});

import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";

const startedAt = "2026-07-26T09:00:00.000Z";

/**
 * Deploy a SAM function whose `Events` are what the test is about, on a clock
 * the test moves, with a handler recording every invocation.
 */
async function deployScheduled(properties: {
  readonly simAws: SimAws;
  readonly events: SimCfnTemplateValueRecord;
  readonly resources?: SimCfnTemplateValueRecord;
  readonly received: unknown[];
}): Promise<SimCfnDeployedStack> {
  const stack = await properties.simAws.cloudFormation().deployTemplate({
    stackName: "reporting-stack",
    template: simCfnSamFunctionTemplateFactory.make({
      functionProperties: { Events: properties.events },
      resources: properties.resources ?? {},
    }),
    bindings: [
      {
        logicalId: samFunctionTemplateLogicalId,
        handler: (event: unknown): string => {
          properties.received.push(event);

          return "reported";
        },
      },
    ],
  });

  await stack.waitForDeployComplete();

  return stack;
}

describe("SAM ScheduleV2 event expansion", () => {
  it("invokes the bound handler from a schedule rather than a rule", async () => {
    // Given a SAM function with an hourly ScheduleV2 event
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date(startedAt)),
    });
    const received: unknown[] = [];

    // When it is deployed and three simulated hours pass
    const stack = await deployScheduled({
      simAws,
      events: {
        Report: {
          Type: "ScheduleV2",
          Properties: { ScheduleExpression: "rate(1 hour)" },
        },
      },
      received,
    });

    await simAws.clock().advanceBy({ hours: 3 });

    // Then the schedule invoked the function once an hour as the execution
    // role it was expanded with, and no rule was made for it
    assertArrayEmpty(stack.skippedResources);
    assertNonNullable(stack.getResource("RatesReportSchedule"));
    assertUndefined(stack.getResource("RatesReportRule"));
    assertArrayLength(received, 3);
  });

  it("carries what the event said about the schedule", async () => {
    // Given a ScheduleV2 event stating a name, a description and an input
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date(startedAt)),
    });
    const received: unknown[] = [];

    // When it is deployed and an hour passes
    await deployScheduled({
      simAws,
      events: {
        Report: {
          Type: "ScheduleV2",
          Properties: {
            ScheduleExpression: "rate(1 hour)",
            Name: "hourly-report",
            Description: "Reports the day's rates",
            Enabled: true,
            Input: JSON.stringify({ ledger: "rates" }),
          },
        },
      },
      received,
    });

    await simAws.clock().advanceBy({ hours: 1 });

    // Then the schedule carries the name and description the event stated
    const schedule = simAws.scheduler().findSchedule("hourly-report");

    assertNonNullable(schedule);
    assertIdentical(schedule.description, "Reports the day's rates");
    assertIdentical(schedule.state.value, "ENABLED");

    // And the handler was invoked with the input the event stated
    assertObjectEquals(received, [{ ledger: "rates" }]);
  });

  it("runs as the role the event named, expanding none of its own", async () => {
    // Given an event naming a role the template declares beside the function
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date(startedAt)),
    });
    const received: unknown[] = [];

    // When it is deployed and an hour passes
    const stack = await deployScheduled({
      simAws,
      events: {
        Report: {
          Type: "ScheduleV2",
          Properties: {
            ScheduleExpression: "rate(1 hour)",
            Name: "hourly-report",
            FlexibleTimeWindow: { Mode: "OFF" },
            RoleArn: { "Fn::GetAtt": ["ReportingRole", "Arn"] },
          },
        },
      },
      resources: {
        ReportingRole: {
          Type: "AWS::IAM::Role",
          Properties: {
            RoleName: "ReportingRole",
            AssumeRolePolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "scheduler.amazonaws.com" },
                  Action: "sts:AssumeRole",
                },
              ],
            },
            Policies: [
              {
                PolicyName: "InvokeRates",
                PolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "lambda:InvokeFunction",
                      Resource: { "Fn::GetAtt": ["Rates", "Arn"] },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
      received,
    });

    await simAws.clock().advanceBy({ hours: 1 });

    // Then the schedule assumed the named role, and the expansion left the
    // role it would otherwise have made out of the stack
    const schedule = simAws.scheduler().findSchedule("hourly-report");

    assertNonNullable(schedule);
    assertIdentical(
      schedule.target.roleArn,
      stack.getResource("ReportingRole")?.attributeValue("Arn"),
    );
    assertUndefined(stack.getResource("RatesReportScheduleRole"));
    assertArrayLength(received, 1);
  });
});

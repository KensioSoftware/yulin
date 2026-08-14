/**
 * A schedule deployed from a template, firing as simulated time advances.
 */

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reporting-stack",
  template: {
    Resources: {
      ReportQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "reports" },
      },
      HourlyReport: {
        Type: "AWS::Scheduler::Schedule",
        Properties: {
          Name: "hourly-report",
          ScheduleExpression: "rate(1 hour)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: {
            Arn: { "Fn::GetAtt": ["ReportQueue", "Arn"] },
            RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.outputs.size); // 0, and the schedule is armed

// Three simulated hours on, the schedule has fallen due three times.
await simAws.clock().advanceBy({ hours: 3 });

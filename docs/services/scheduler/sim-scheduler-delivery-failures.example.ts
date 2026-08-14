/**
 * Finding out why a schedule's target was never invoked.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

// A role that trusts EventBridge rules rather than Scheduler.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SchedulerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "hourly-report",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

await simAws.clock().advanceBy({ hours: 1 });

const [failure] = simAws.scheduler().deliveryFailures;

console.log(failure?.message);
// "The trust policy of arn:aws:iam::888888888888:role/SchedulerRole does not
//  allow scheduler.amazonaws.com to assume it, ..."

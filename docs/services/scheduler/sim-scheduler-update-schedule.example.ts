/**
 * An update replaces the whole schedule rather than merging into it.
 */

import {
  CreateScheduleCommand,
  GetScheduleCommand,
  UpdateScheduleCommand,
} from "@aws-sdk/client-scheduler";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const scheduler = simAws.scheduler();
const target = {
  Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
  RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
};

await scheduler.createSchedule(
  new CreateScheduleCommand({
    Name: "nightly-report",
    Description: "The nightly reconciliation",
    ScheduleExpression: "cron(0 2 * * ? *)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: target,
  }),
);

// Meaning only to change the expression, and leaving the description out.
await scheduler.updateSchedule(
  new UpdateScheduleCommand({
    Name: "nightly-report",
    ScheduleExpression: "rate(30 minutes)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: target,
  }),
);

const described = await scheduler.getSchedule(
  new GetScheduleCommand({ Name: "nightly-report" }),
);

console.log(described.ScheduleExpression); // "rate(30 minutes)"
console.log(described.Description); // undefined, and not by accident

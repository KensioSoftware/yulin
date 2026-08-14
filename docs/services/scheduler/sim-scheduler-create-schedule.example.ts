/**
 * Creating a schedule that invokes a function every night.
 */

import {
  CreateScheduleCommand,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const scheduler = simAws.scheduler();

const created = await scheduler.createSchedule(
  new CreateScheduleCommand({
    Name: "nightly-report",
    ScheduleExpression: "cron(0 2 * * ? *)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

console.log(created.ScheduleArn);
// "arn:aws:scheduler:us-east-1:888888888888:schedule/default/nightly-report"

const described = await scheduler.getSchedule(
  new GetScheduleCommand({ Name: "nightly-report" }),
);

console.log(described.ScheduleExpression); // "cron(0 2 * * ? *)"

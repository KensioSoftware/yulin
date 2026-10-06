/**
 * A schedule invoking its target up to fifteen minutes after each hour.
 */

import {
  CreateScheduleCommand,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";

import { SimAws, SimSeededRandom } from "@kensio/yulin";

// The same seed draws the same invocation moments on every run.
const simAws = new SimAws({ random: new SimSeededRandom(2026) });

await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "hourly-digest",
    ScheduleExpression: "cron(0 * * * ? *)",
    FlexibleTimeWindow: { Mode: "FLEXIBLE", MaximumWindowInMinutes: 15 },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:digest",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

const described = await simAws
  .scheduler()
  .getSchedule(new GetScheduleCommand({ Name: "hourly-digest" }));

console.log(described.FlexibleTimeWindow);
// { Mode: "FLEXIBLE", MaximumWindowInMinutes: 15 }

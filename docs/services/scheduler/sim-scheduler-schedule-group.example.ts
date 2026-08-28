/**
 * A schedule group scoping the names of one deployment's schedules.
 */

import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  ListSchedulesCommand,
} from "@aws-sdk/client-scheduler";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const scheduler = simAws.scheduler();

const group = await scheduler.createScheduleGroup(
  new CreateScheduleGroupCommand({ Name: "reporting-pr-412" }),
);

console.log(group.ScheduleGroupArn);
// "arn:aws:scheduler:us-east-1:888888888888:schedule-group/reporting-pr-412"

const created = await scheduler.createSchedule(
  new CreateScheduleCommand({
    Name: "pageviews-hourly",
    GroupName: "reporting-pr-412",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

// The group is in the schedule's ARN. The same schedule name is free in every
// other group, including default.
console.log(created.ScheduleArn);
// ".../schedule/reporting-pr-412/pageviews-hourly"

const listed = await scheduler.listSchedules(
  new ListSchedulesCommand({ GroupName: "reporting-pr-412" }),
);

console.log(listed.Schedules?.length); // 1

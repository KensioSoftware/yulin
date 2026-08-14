/**
 * A Role allowed to manage one schedule and no other.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ScheduleAdministrator",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::888888888888:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ScheduleAdministrator",
    PolicyName: "ManageNightlyReport",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "scheduler:CreateSchedule",
        // The group is part of the ARN, so a policy without it matches nothing.
        Resource:
          "arn:aws:scheduler:us-east-1:888888888888:schedule/default/nightly-report",
      },
    }),
  }),
);

const created = await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "nightly-report",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(created.ScheduleArn !== undefined); // true

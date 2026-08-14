/**
 * A schedule invoking a function three times in three simulated hours.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { SimAws, SimFixedClock } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:report";
const runs: string[] = [];

await simAws.lambda().createFunction({
  input: {
    FunctionName: "report",
    Role: "arn:aws:iam::888888888888:role/ReportRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        runs.push("ran");
        return { ok: true };
      }),
    },
  },
});

// The execution role has to trust Scheduler, and be allowed to invoke.
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

await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "hourly-report",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: functionArn,
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

await simAws.clock().advanceBy({ hours: 3 });

console.log(runs.length); // 3

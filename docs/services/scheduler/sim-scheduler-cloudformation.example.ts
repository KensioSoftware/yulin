/**
 * A schedule deployed from a template, firing as simulated time advances.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const queueArn = "arn:aws:sqs:us-east-1:888888888888:reports";
const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

// The execution role has to trust Scheduler, and be allowed to send.
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
    PolicyName: "SendReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sqs:SendMessage",
        Resource: queueArn,
      },
    }),
  }),
);

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
            RoleArn: roleArn,
            Input: JSON.stringify({ report: "hourly" }),
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// Three simulated hours on, the schedule has invoked its target three times.
await simAws.clock().advanceBy({ hours: 3 });

const received = await simAws.sqs().receiveMessage(
  new ReceiveMessageCommand({
    QueueUrl: "https://sqs.us-east-1.amazonaws.com/888888888888/reports",
    MaxNumberOfMessages: 10,
  }),
);

console.log(received.Messages?.length); // 3

// Nothing went wrong on the way, which is worth checking: a schedule that
// could not reach its target says so here rather than by throwing.
console.log(simAws.scheduler().deliveryFailures.length); // 0

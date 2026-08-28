/**
 * A stack deploying its own schedule group, with a schedule in it.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reporting-stack",
  template: {
    Resources: {
      ReportGroup: {
        Type: "AWS::Scheduler::ScheduleGroup",
        Properties: { Name: "reporting-pr-412" },
      },
      HourlyReport: {
        Type: "AWS::Scheduler::Schedule",
        Properties: {
          Name: "pageviews-hourly",
          GroupName: { Ref: "ReportGroup" },
          ScheduleExpression: "rate(1 hour)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: {
            Arn: "arn:aws:sqs:us-east-1:888888888888:reports",
            RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
          },
        },
      },
    },
    Outputs: {
      GroupArn: { Value: { "Fn::GetAtt": ["ReportGroup", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

// An execution role policy is often written against this, since it covers
// every schedule the group will ever hold.
console.log(stack.output("GroupArn"));
// "arn:aws:scheduler:us-east-1:888888888888:schedule-group/reporting-pr-412"

/**
 * Creating an IAM User through simulated CloudFormation.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "iam-user-stack",
  template: {
    Resources: {
      ReportsReadPolicy: {
        Type: "AWS::IAM::ManagedPolicy",
        Properties: {
          ManagedPolicyName: "ReportsReadPolicy",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::reports-bucket/*",
            },
          },
        },
      },
      ReportPublisher: {
        Type: "AWS::IAM::User",
        Properties: {
          UserName: "ReportPublisher",
          Path: "/application/",
          ManagedPolicyArns: [{ Ref: "ReportsReadPolicy" }],
          Policies: [
            {
              PolicyName: "WriteReports",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: {
                  Effect: "Allow",
                  Action: "s3:PutObject",
                  Resource: "arn:aws:s3:::reports-bucket/*",
                },
              },
            },
          ],
          LoginProfile: {
            Password: "initial-console-password",
            PasswordResetRequired: true,
          },
        },
      },
    },
    Outputs: {
      UserArn: {
        Value: {
          "Fn::GetAtt": ["ReportPublisher", "Arn"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const simIam = simAws.iam();

const decision = simIam.authorize({
  action: "s3:PutObject",
  resource: "arn:aws:s3:::reports-bucket/2026/summary.csv",
  caller: { kind: "arn", arn: stack.output("UserArn") },
});

console.log(decision.isAllowed);

const user = simIam.users
  .values()
  .find((each) => each.userName === "ReportPublisher");

console.log(user?.loginProfile?.passwordResetRequired);

/**
 * Deploying a template in the order CloudFormation could have picked instead.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "alerts-stack",
  template: {
    Resources: {
      DeployerSns: {
        Type: "AWS::IAM::Policy",
        Properties: {
          PolicyName: "DeployerSns",
          Roles: ["cdk-deploy-role"],
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: { Effect: "Allow", Action: "sns:*", Resource: "*" },
          },
        },
      },
      Alerts: {
        Type: "AWS::SNS::Topic",
        DependsOn: "DeployerSns",
        Properties: { TopicName: "alerts" },
      },
    },
  },
  caller: {
    kind: "arn",
    arn: "arn:aws:iam::123456789012:role/cdk-deploy-role",
  },
  resourceOrder: "reversed",
});

console.log(stack.getResource("Alerts")?.status); // "CREATE_COMPLETE"

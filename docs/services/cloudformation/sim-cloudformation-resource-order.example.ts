/**
 * Deploying a template in the order CloudFormation could have picked instead.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

// The Role a real deployment already runs as, allowed to attach policies and
// nothing else.
await simAws.iam().createRole({
  input: {
    RoleName: "cdk-deploy-role",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: { Service: "cloudformation.amazonaws.com" },
      },
    }),
  },
});

await simAws.iam().putRolePolicy({
  input: {
    RoleName: "cdk-deploy-role",
    PolicyName: "deploy",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "iam:*", Resource: "*" },
    }),
  },
});

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

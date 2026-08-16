/**
 * A simulated IAM policy allowing a Role to publish into one namespace only.
 */

import { PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersFunctionRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersFunctionRole",
    PolicyName: "PublishOrdersMetrics",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "cloudwatch:PutMetricData",
        // Metrics have no ARN, so the namespace condition is what scopes this.
        Resource: "*",
        Condition: { StringEquals: { "cloudwatch:namespace": "Orders" } },
      },
    }),
  }),
);

const asRole = { caller: { kind: "arn", arn: role.Role.Arn } } as const;

await simAws.cloudWatch().putMetricData(
  new PutMetricDataCommand({
    Namespace: "Orders",
    MetricData: [{ MetricName: "Failed", Value: 1 }],
  }),
  asRole,
);

// Publishing into any other namespace as this Role is denied.

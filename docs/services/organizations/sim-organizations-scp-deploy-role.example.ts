/**
 * A policy denying the account root, and a deployment that names a Role.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "cdk-deploy-role",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "cloudformation.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "cdk-deploy-role",
    PolicyName: "Deploy",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
    }),
  }),
);

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyRootPrincipal",
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { ArnLike: { "aws:PrincipalArn": "arn:aws:iam::*:root" } },
  },
});

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reports-stack",
  template: {
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "reports-bucket" },
      },
    },
  },
  caller: { kind: "arn", arn: roleCreation.Role.Arn },
});

console.log(stack.getResource("ReportsBucket")?.status); // "CREATE_COMPLETE"

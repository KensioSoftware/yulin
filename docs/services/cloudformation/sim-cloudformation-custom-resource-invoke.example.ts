/**
 * A deploy Role refused the provider invoke its custom resource needs.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const { Role } = await simAws.iam().createRole({
  input: {
    RoleName: "DeployRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "cloudformation.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  },
});

// Everything the template needs apart from the invoke of the provider.
await simAws.iam().putRolePolicy({
  input: {
    RoleName: "DeployRole",
    PolicyName: "DeployPolicy",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["cloudformation:*", "s3:*"],
          Resource: "*",
        },
      ],
    }),
  },
});

try {
  await simAws.cloudFormation().deployTemplate({
    stackName: "uploads-stack",
    caller: { kind: "arn", arn: Role.Arn },
    template: {
      Resources: {
        Bucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "uploads" },
        },
        BucketNotifications: {
          Type: "Custom::S3BucketNotifications",
          Properties: {
            ServiceToken: "arn:aws:lambda:us-east-1:888888888888:function:cdk",
            BucketName: { Ref: "Bucket" },
            NotificationConfiguration: {},
            Managed: true,
          },
        },
      },
    },
  });
} catch (error) {
  // is not authorized to perform: lambda:InvokeFunction on resource:
  // arn:aws:lambda:us-east-1:888888888888:function:cdk
  console.log((error as Error).message);
}

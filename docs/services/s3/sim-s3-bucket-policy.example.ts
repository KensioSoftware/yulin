/**
 * Granting access to a simulated S3 Bucket with a Bucket policy.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  GetBucketPolicyCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.iam();
const simS3 = simAws.s3();

// The principal the Bucket policy will name. It gets no identity policy, so
// the Bucket policy is the whole of its access.
const roleOut = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportReader",
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

await simAws.cloudFormation().deployTemplate({
  stackName: "reports-stack",
  template: {
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "reports" },
      },
      ReportsBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: { Ref: "ReportsBucket" },
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: roleOut.Role.Arn },
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::reports/*",
              },
            ],
          },
        },
      },
    },
  },
});

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports",
    Key: "q3/report.txt",
    Body: "quarterly numbers",
  }),
);

// The deployed policy authorizes the read.
const objectOut = await simS3.getObject(
  new GetObjectCommand({ Bucket: "reports", Key: "q3/report.txt" }),
  { caller: { kind: "arn", arn: roleOut.Role.Arn } },
);

console.log(objectOut.Metadata);

// The same document comes back out as a JSON string.
const policyOut = await simS3.getBucketPolicy(
  new GetBucketPolicyCommand({ Bucket: "reports" }),
);

console.log(policyOut.Policy);

/**
 * What simulated S3 answers for an Object that is not there.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateBucketCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.iam();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));

const readerCreation = await simIam.createRole(
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

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReportReader",
    PolicyName: "ReadReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports/*",
      },
    }),
  }),
);

const asReader = {
  caller: { kind: "arn", arn: readerCreation.Role.Arn },
} as const;

try {
  await simS3.getObject(
    new GetObjectCommand({ Bucket: "reports", Key: "q4/report.txt" }),
    asReader,
  );
} catch (error) {
  // AccessDenied, with a 403 status. This caller may not list the Bucket, and
  // S3 will not tell it whether the key is there.
  console.error("Read refused", error);
}

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReportReader",
    PolicyName: "ListReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: "arn:aws:s3:::reports",
      },
    }),
  }),
);

try {
  await simS3.getObject(
    new GetObjectCommand({ Bucket: "reports", Key: "q4/report.txt" }),
    asReader,
  );
} catch (error) {
  // NoSuchKey, with a 404 status.
  console.error("Object missing", error);
}

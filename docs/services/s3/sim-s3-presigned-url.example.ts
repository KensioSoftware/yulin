/**
 * Downloading a simulated S3 Object through a presigned URL.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.region("eu-west-2").s3();
  const simIam = simAws.iam();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "reports",
      Key: "q3/report.txt",
      Body: "quarterly numbers",
      ContentType: "text/plain",
    }),
  );

  // Whoever presigns the URL needs permission for what it will be used for.
  await simIam.createUser(new CreateUserCommand({ UserName: "Publisher" }));
  await simIam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Publisher",
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
  const accessKey = await simIam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "Publisher" }),
  );

  // The endpoint includes the port the local server took, because a presigned
  // URL signs its own host and cannot be redirected elsewhere afterwards.
  const s3Client = new S3Client({
    region: "eu-west-2",
    endpoint: srv.localUrl(simS3.getServiceUrl()).toString(),
    credentials: {
      accessKeyId: accessKey.AccessKey.AccessKeyId,
      secretAccessKey: accessKey.AccessKey.SecretAccessKey,
    },
  });

  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: "reports", Key: "q3/report.txt" }),
    { expiresIn: 900 },
  );

  const response = await fetch(url);

  console.log(response.status);
  console.log(await response.text());
} finally {
  srv.close();
}

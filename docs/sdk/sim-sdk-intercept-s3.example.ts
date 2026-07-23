/**
 * Intercepting the S3 SDK client with simulated AWS behind it.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SimSdk } from "@kensio/yulin/sdk";

const simSdk = new SimSdk();
simSdk.intercept(S3Client); // Intercepts every instance of the class.

// From here on, this is ordinary AWS SDK code.
const s3Client = new S3Client({ region: "eu-west-2" });
await s3Client.send(new CreateBucketCommand({ Bucket: "foo-bucket" }));
await s3Client.send(
  new PutObjectCommand({
    Bucket: "foo-bucket",
    Key: "hello.txt",
    Body: "Hello, world!",
  }),
);

const output = await s3Client.send(
  new GetObjectCommand({ Bucket: "foo-bucket", Key: "hello.txt" }),
);
console.log(await output.Body?.transformToString()); // "Hello, world!"

simSdk.restoreAll();

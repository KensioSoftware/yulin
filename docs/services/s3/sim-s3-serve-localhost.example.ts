/**
 * Serving simulated S3 on localhost.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.region("eu-west-2").s3();

  await simS3.createBucket(
    new CreateBucketCommand({
      Bucket: "foo-site",
    }),
  );

  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "foo-site",
      Key: "index.html",
      Body: "<h1>Hello from localhost S3</h1>",
      ContentType: "text/html; charset=utf-8",
    }),
  );

  await simS3.putBucketWebsite(
    new PutBucketWebsiteCommand({
      Bucket: "foo-site",
      WebsiteConfiguration: {
        IndexDocument: {
          Suffix: "index.html",
        },
      },
    }),
  );

  const websiteUrl = simS3.getBucketWebsiteUrl("foo-site");
  const localWebsiteUrl = srv.localUrl(websiteUrl);

  const response = await fetch(localWebsiteUrl);

  console.log(response.status);
  console.log(response.headers.get("content-type"));
  console.log(await response.text());
} finally {
  srv.close();
}

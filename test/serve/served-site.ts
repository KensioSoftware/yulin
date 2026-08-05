import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimAwsLocalServer } from "../../src/serve/http/local-server/sim-aws-local-server.js";
import { grantPublicWebsiteRead } from "../../src/service/s3/bucket/website/sim-s3-public-website.fixture.js";

/**
 * A Bucket website holding one HTML page, which is the smallest thing a browser
 * can be pointed at through the local server.
 */
export async function simServedSite(
  simAws: SimAws,
  bucketName: string,
  html: string,
): Promise<void> {
  const simS3 = simAws.s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: "index.html",
      Body: html,
      ContentType: "text/html; charset=utf-8",
    }),
  );
  await simS3.putBucketWebsite(
    new PutBucketWebsiteCommand({
      Bucket: bucketName,
      WebsiteConfiguration: { IndexDocument: { Suffix: "index.html" } },
    }),
  );
  await grantPublicWebsiteRead(simS3, bucketName);
}

/**
 * The local URL of a served Bucket website page.
 */
export function simServedSiteUrl(
  simAws: SimAws,
  server: SimAwsLocalServer,
  bucketName: string,
): URL {
  return server.localUrl(simAws.s3().getBucketWebsiteUrl(bucketName));
}

/**
 * Ask for a page the way a browser asks for one.
 */
export async function simBrowserFetch(url: URL | string): Promise<Response> {
  return fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
  });
}

/**
 * A real S3 client signing for the local server, for the other kind of caller a
 * served environment gets: an SDK reading the same Object as an Object.
 */
export async function simServedSiteS3Client(
  simAws: SimAws,
  server: SimAwsLocalServer,
  bucketName: string,
): Promise<S3Client> {
  const simIam = simAws.iam();

  await simIam.createUser(new CreateUserCommand({ UserName: "SiteReader" }));
  await simIam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "SiteReader",
      PolicyName: "ReadSiteObjects",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${bucketName}/*`,
        },
      }),
    }),
  );
  const accessKey = await simIam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "SiteReader" }),
  );

  return new S3Client({
    region: simAws.defaultRegionName,
    endpoint: server.localUrl(simAws.s3().getServiceUrl()).toString(),
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: accessKey.AccessKey.AccessKeyId,
      secretAccessKey: accessKey.AccessKey.SecretAccessKey,
    },
  });
}

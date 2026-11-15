import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertResponseStatus, describeResponse } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsSourceIpHeaderName } from "../../iam/request/sim-aws-source-ip-header.js";

/**
 * A Bucket serving one public page, to callers from one address range only.
 *
 * The Deny on any other address is the shape a Bucket policy limiting a site
 * to an office network takes.
 */
async function officeOnlySite(
  simAws: SimAws,
  bucketName: string,
): Promise<void> {
  const simS3 = simAws.region("eu-west-2").s3();
  await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await simS3.putPublicAccessBlock({
    input: {
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    },
  });
  await simS3.putBucketWebsite(
    new PutBucketWebsiteCommand({
      Bucket: bucketName,
      WebsiteConfiguration: { IndexDocument: { Suffix: "index.html" } },
    }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: "index.html",
      Body: "<h1>Hello</h1>",
    }),
  );
  const objects = `arn:aws:s3:::${bucketName}/*`;
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: objects,
          },
          {
            Effect: "Deny",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: objects,
            Condition: { NotIpAddress: { "aws:SourceIp": "192.0.2.0/24" } },
          },
        ],
      }),
    }),
  );
}

describe("Simulated S3 served requests and aws:SourceIp", () => {
  it.each([
    ["website", "s3-website"],
    ["REST", "s3"],
  ])(
    "admits a %s request only from the address range a Bucket policy allows",
    async (_endpoint, host) => {
      // Given a Bucket readable from one address range only
      const simAws = new SimAws();
      const bucketName = `office-site-${host}`;
      await officeOnlySite(simAws, bucketName);
      const http = new SimAwsHttp({ simAws });
      const url = `http://${bucketName}.${host}.eu-west-2.sim-aws.localhost/index.html`;

      // When the page is read from inside the range and from loopback
      const inside = await http.fetch(url, {
        headers: { [simAwsSourceIpHeaderName]: "192.0.2.10" },
      });
      const loopback = await http.fetch(url);

      // Then only the read from inside the range is served
      assertResponseStatus(inside, 200, await describeResponse(inside));
      assertResponseStatus(loopback, 403, await describeResponse(loopback));
    },
  );
});

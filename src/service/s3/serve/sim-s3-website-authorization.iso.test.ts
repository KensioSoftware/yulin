import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import { grantPublicWebsiteRead } from "../bucket/website/sim-s3-public-website.fixture.js";
import type { SimS3 } from "../sim-s3.js";

/**
 * Authorization on the static website endpoint.
 *
 * Real S3 serves a website endpoint only what the Bucket policy has made
 * readable, answering 403 for an Object that is not publicly readable. Getting
 * this wrong in the simulator is the expensive direction: a site that works in
 * a test and 403s on deploy is the single most common S3 static website
 * mistake, and one the simulator could not reproduce before.
 */
describe("Simulated S3 static website authorization", () => {
  const siteUrl = (bucketName: string, path = "/index.html"): string =>
    `http://${bucketName}.s3-website.eu-west-2.sim-aws.localhost${path}`;

  const websiteSite = async (
    simS3: SimS3,
    bucketName: string,
    errorDocumentKey?: string,
  ): Promise<void> => {
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: bucketName,
        WebsiteConfiguration: {
          IndexDocument: { Suffix: "index.html" },
          ...(errorDocumentKey !== undefined && {
            ErrorDocument: { Key: errorDocumentKey },
          }),
        },
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "index.html",
        Body: "<h1>Hello</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );
  };

  it("refuses a website Bucket with no Bucket policy", async () => {
    // Given a website Bucket whose Objects nothing has made readable.
    const simAws = new SimAws();
    const simAwsHttp = new SimAwsHttp({ simAws });
    const simS3 = simAws.region("eu-west-2").s3();

    await websiteSite(simS3, "unreadable-site");

    // When a browser asks for the index document.
    const response = await simAwsHttp.fetch(siteUrl("unreadable-site"));

    // Then the site answers 403, as real S3 does for an Object that is not
    // publicly readable.
    assertResponseStatus(response, 403);
    assertStringIncludes(await response.text(), "Access denied");
  });

  it("serves the site once a Bucket policy makes it readable", async () => {
    // Given the same Bucket with a policy granting anonymous reads.
    const simAws = new SimAws();
    const simAwsHttp = new SimAwsHttp({ simAws });
    const simS3 = simAws.region("eu-west-2").s3();

    await websiteSite(simS3, "readable-site");
    await grantPublicWebsiteRead(simS3, "readable-site");

    // When a browser asks for the index document.
    const response = await simAwsHttp.fetch(siteUrl("readable-site"));

    // Then it is served.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Hello</h1>");
  });

  it("refuses a HEAD request the same way it refuses a GET", async () => {
    // Given a website Bucket with no Bucket policy.
    const simAws = new SimAws();
    const simAwsHttp = new SimAwsHttp({ simAws });
    const simS3 = simAws.region("eu-west-2").s3();

    await websiteSite(simS3, "head-unreadable-site");

    // When a browser sends HEAD rather than GET.
    const response = await simAwsHttp.fetch(siteUrl("head-unreadable-site"), {
      method: "HEAD",
    });

    // Then the same authorization applies.
    assertResponseStatus(response, 403);
  });

  it("serves the error document on a denied request when it is readable", async () => {
    // Given a website Bucket whose policy makes only the error document
    // readable, so the requested Object is denied but the error document is
    // not.
    const simAws = new SimAws();
    const simAwsHttp = new SimAwsHttp({ simAws });
    const simS3 = simAws.region("eu-west-2").s3();

    await websiteSite(simS3, "error-doc-site", "error.html");
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "error-doc-site",
        Key: "error.html",
        Body: "<h1>Nothing to see</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );
    await simS3.putPublicAccessBlock({
      input: {
        Bucket: "error-doc-site",
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
        },
      },
    });
    await simS3.putBucketPolicy({
      input: {
        Bucket: "error-doc-site",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::error-doc-site/error.html",
          },
        }),
      },
    });

    // When a browser asks for the index document.
    const response = await simAwsHttp.fetch(siteUrl("error-doc-site"));

    // Then the custom error document is served with the 403, because real S3
    // returns it for the whole 4XX class rather than only for 404.
    assertResponseStatus(response, 403);
    assertIdentical(await response.text(), "<h1>Nothing to see</h1>");
  });

  it("falls back to a plain refusal when the error document is unreadable too", async () => {
    // Given a website Bucket with an error document and no Bucket policy at
    // all, so nothing in it is readable.
    const simAws = new SimAws();
    const simAwsHttp = new SimAwsHttp({ simAws });
    const simS3 = simAws.region("eu-west-2").s3();

    await websiteSite(simS3, "closed-error-doc-site", "error.html");
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "closed-error-doc-site",
        Key: "error.html",
        Body: "<h1>Nothing to see</h1>",
      }),
    );

    // When a browser asks for the index document.
    const response = await simAwsHttp.fetch(siteUrl("closed-error-doc-site"));

    // Then the refusal is answered plainly rather than by serving a document
    // the visitor is equally not allowed to read.
    assertResponseStatus(response, 403);
    assertStringIncludes(await response.text(), "Access denied");
  });

  it("authorizes a named principal rather than treating every visitor as anonymous", async () => {
    // Given a Bucket readable by one Role and not by the public.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simAwsHttp = new SimAwsHttp({ simAws });
    const simIam = simAws.iam();
    const simS3 = simAws.region("eu-west-2").s3();

    await websiteSite(simS3, "private-site");
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "SiteReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SiteReader",
        PolicyName: "ReadSite",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::private-site/*",
          },
        }),
      }),
    );

    // When the request names that Role, and when it names nobody.
    const namedResponse = await simAwsHttp.fetch(siteUrl("private-site"), {
      headers: { "x-sim-aws-caller": roleCreation.Role.Arn },
    });
    const anonymousResponse = await simAwsHttp.fetch(siteUrl("private-site"));

    // Then the website endpoint serves the Role what its identity policy
    // grants, and still refuses everyone else.
    assertResponseStatus(namedResponse, 200);
    assertIdentical(await namedResponse.text(), "<h1>Hello</h1>");
    assertResponseStatus(anonymousResponse, 403);
  });
});

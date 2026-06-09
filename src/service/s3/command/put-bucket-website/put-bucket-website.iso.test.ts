import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3NoSuchBucket } from "../../error/s3.error.js";

describe("S3 PutBucketWebsiteCommand", () => {
  it("configures an index document for an S3 Bucket website", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));

    const output = await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "foo-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );

    assertObjectEquals(output.$metadata, {});

    const bucket = simS3.getSimBucketByName("foo-site");

    assertTrue(bucket?.getWebsite().websiteEnabled());
    assertIdentical(
      bucket.getWebsite().objectKeyForRequest("docs/"),
      "docs/index.html",
    );
  });

  it("configures an error document for an S3 Bucket website", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "error-site" }));

    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "error-site",
        WebsiteConfiguration: {
          ErrorDocument: {
            Key: "error.html",
          },
        },
      }),
    );

    const bucket = simS3.getSimBucketByName("error-site");

    assertNonNullable(bucket);
    assertTrue(bucket.getWebsite().websiteEnabled());
    assertIdentical(bucket.getWebsite().errorDocumentKey(), "error.html");
  });

  it("configures redirect all requests for an S3 Bucket website", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "redirect-site" }),
    );

    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "redirect-site",
        WebsiteConfiguration: {
          RedirectAllRequestsTo: {
            HostName: "example.com",
            Protocol: "https",
          },
        },
      }),
    );

    const bucket = simS3.getSimBucketByName("redirect-site");

    assertNonNullable(bucket);
    assertTrue(bucket.getWebsite().websiteEnabled());
    assertTrue(bucket.getWebsite().redirectsAllRequests());
  });

  it("configures routing rules for an S3 Bucket website", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "rules-site" }));

    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "rules-site",
        WebsiteConfiguration: {
          RoutingRules: [
            {
              Condition: {
                HttpErrorCodeReturnedEquals: "404",
              },
              Redirect: {
                ReplaceKeyWith: "not-found.html",
              },
            },
          ],
        },
      }),
    );

    const bucket = simS3.getSimBucketByName("rules-site");
    assertNonNullable(bucket);
    const res = bucket
      .getWebsite()
      .redirectForRequestResponse(
        new Request("http://rules-site.s3-website.localhost/missing.html"),
        new Response("Missing", { status: 404 }),
      );

    assertNonNullable(res);
    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "http://rules-site.s3-website.localhost/not-found.html",
    );
  });

  it("gets the configured S3 Bucket website URL", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "url-site" }));

    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "url-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );

    const url = simS3.getBucketWebsiteUrl("url-site");

    assertIdentical(
      url.toString(),
      "http://url-site.s3-website.eu-west-2.sim-aws.localhost/",
    );
  });

  it("throws when getting an S3 Bucket website URL before website hosting is configured", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "disabled-url-site" }),
    );

    const error = assertThrowsError(() => {
      simS3.getBucketWebsiteUrl("disabled-url-site");
    });

    assertStringIncludes(
      error.message,
      "Static website hosting is not enabled for sim S3 Bucket disabled-url-site",
    );
  });

  it("replaces existing website configuration", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "replace-site" }),
    );

    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "replace-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );

    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "replace-site",
        WebsiteConfiguration: {
          ErrorDocument: {
            Key: "error.html",
          },
        },
      }),
    );

    const bucket = simS3.getSimBucketByName("replace-site");

    assertNonNullable(bucket);
    assertIdentical(bucket.getWebsite().objectKeyForRequest("docs/"), "docs/");
    assertIdentical(bucket.getWebsite().errorDocumentKey(), "error.html");
  });

  it("throws on undefined Bucket name", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketWebsite(
        new PutBucketWebsiteCommand({
          Bucket: undefined,
          WebsiteConfiguration: {
            IndexDocument: {
              Suffix: "index.html",
            },
          },
        }),
      ),
    );

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "PutBucketWebsiteCommand.input.Bucket must be defined",
    );
  });

  it("throws on undefined website configuration", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketWebsite(
        new PutBucketWebsiteCommand({
          Bucket: "foo-site",
          WebsiteConfiguration: undefined,
        }),
      ),
    );

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "PutBucketWebsiteCommand.input.WebsiteConfiguration must be defined",
    );
  });

  it("throws when the Bucket does not exist", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketWebsite(
        new PutBucketWebsiteCommand({
          Bucket: "missing-site",
          WebsiteConfiguration: {
            IndexDocument: {
              Suffix: "index.html",
            },
          },
        }),
      ),
    );

    assertInstanceOf(error, SimS3NoSuchBucket);
    assertStringIncludes(error.message, "No S3 Bucket named missing-site");
  });
});

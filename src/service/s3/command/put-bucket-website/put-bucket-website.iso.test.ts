import {
  CreateBucketCommand,
  NoSuchBucket,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertObjectEquals,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimS3BucketName } from "../../bucket/s3-bucket.js";

describe("S3 PutBucketWebsiteCommand", () => {
  it("configures an index document for an S3 Bucket website", async () => {
    const simS3 = new SimAws().s3();

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

    const bucket = simS3.getSimBucketByName("foo-site" as SimS3BucketName);

    assertTrue(bucket?.getWebsite().websiteEnabled());
    assertIdentical(
      bucket.getWebsite().objectKeyForRequest("docs/"),
      "docs/index.html",
    );
  });

  it("configures an error document for an S3 Bucket website", async () => {
    const simS3 = new SimAws().s3();

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

    const bucket = simS3.getSimBucketByName("error-site" as SimS3BucketName);

    assertNonNullable(bucket);
    assertTrue(bucket.getWebsite().websiteEnabled());
    assertIdentical(bucket.getWebsite().errorDocumentKey(), "error.html");
  });

  it("configures redirect all requests for an S3 Bucket website", async () => {
    const simS3 = new SimAws().s3();

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

    const bucket = simS3.getSimBucketByName("redirect-site" as SimS3BucketName);

    assertNonNullable(bucket);
    assertTrue(bucket.getWebsite().websiteEnabled());
    assertTrue(bucket.getWebsite().redirectsAllRequests());
  });

  it("configures routing rules for an S3 Bucket website", async () => {
    const simS3 = new SimAws().s3();

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

    const bucket = simS3.getSimBucketByName("rules-site" as SimS3BucketName);
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

  it("replaces existing website configuration", async () => {
    const simS3 = new SimAws().s3();

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

    const bucket = simS3.getSimBucketByName("replace-site" as SimS3BucketName);

    assertNonNullable(bucket);
    assertIdentical(bucket.getWebsite().objectKeyForRequest("docs/"), "docs/");
    assertIdentical(bucket.getWebsite().errorDocumentKey(), "error.html");
  });

  it("throws on undefined Bucket name", async () => {
    const simS3 = new SimAws().s3();

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
    const simS3 = new SimAws().s3();

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
    const simS3 = new SimAws().s3();

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

    assertInstanceOf(error, NoSuchBucket);
    assertStringIncludes(error.message, "No S3 Bucket named missing-site");
  });
});

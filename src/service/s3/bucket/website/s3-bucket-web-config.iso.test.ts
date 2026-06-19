import {
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3BucketWebsite } from "./sim-s3-bucket-website.js";

describe("S3 Bucket static website configuration", () => {
  it("is disabled when no website configuration is specified", () => {
    const website = new SimS3BucketWebsite();

    assertFalse(website.websiteEnabled());
    assertFalse(website.redirectsAllRequests());
    assertUndefined(website.errorDocumentKey());
  });

  it("is enabled when an index document is specified", () => {
    const website = new SimS3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertTrue(website.websiteEnabled());
  });

  it("is enabled when an error document is specified", () => {
    const website = new SimS3BucketWebsite({
      ErrorDocument: {
        Key: "error.html",
      },
    });

    assertTrue(website.websiteEnabled());
    assertIdentical(website.errorDocumentKey(), "error.html");
  });

  it("is enabled when all requests are redirected", () => {
    const website = new SimS3BucketWebsite({
      RedirectAllRequestsTo: {
        HostName: "example.test",
        Protocol: "https",
      },
    });

    assertTrue(website.websiteEnabled());
    assertTrue(website.redirectsAllRequests());
  });

  it("is enabled when a routing rule redirect is specified", () => {
    const website = new SimS3BucketWebsite({
      RoutingRules: [
        {
          Redirect: {
            ReplaceKeyWith: "error.html",
          },
        },
      ],
    });

    assertTrue(website.websiteEnabled());
  });

  it("is disabled when routing rules do not specify redirects", () => {
    const website = new SimS3BucketWebsite({
      RoutingRules: [
        {
          Condition: {
            HttpErrorCodeReturnedEquals: "404",
          },
          Redirect: undefined,
        },
      ],
    });

    assertFalse(website.websiteEnabled());
  });
});

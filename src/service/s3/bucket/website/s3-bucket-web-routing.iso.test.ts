import { assertIdentical, assertResponseStatus } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3BucketWebsite } from "./sim-s3-bucket-website.js";

describe("S3 Bucket static website routing", () => {
  it("resolves the root request to the index document", () => {
    const website = new SimS3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertIdentical(website.objectKeyForRequest(""), "index.html");
  });

  it("resolves a folder request to the folder index document", () => {
    const website = new SimS3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertIdentical(website.objectKeyForRequest("foo/"), "foo/index.html");
  });

  it("leaves a non-folder object key unchanged when an index document is configured", () => {
    const website = new SimS3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertIdentical(
      website.objectKeyForRequest("foo/page.html"),
      "foo/page.html",
    );
  });

  it("leaves object keys unchanged when no index document is configured", () => {
    const website = new SimS3BucketWebsite();

    assertIdentical(website.objectKeyForRequest("foo/"), "foo/");
    assertIdentical(
      website.objectKeyForRequest("foo/page.html"),
      "foo/page.html",
    );
  });

  it("requires all specified routing rule conditions to match", () => {
    const website = new SimS3BucketWebsite({
      RoutingRules: [
        {
          Condition: {
            HttpErrorCodeReturnedEquals: "404",
            KeyPrefixEquals: "docs/",
          },
          Redirect: {
            ReplaceKeyWith: "docs/not-found.html",
          },
        },
      ],
    });
    const originalResponse = new Response("Missing", { status: 404 });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/images/missing.png"),
      originalResponse,
    );

    assertIdentical(res, originalResponse);
  });

  it("uses the first matching routing rule", () => {
    const website = new SimS3BucketWebsite({
      RoutingRules: [
        {
          Condition: {
            HttpErrorCodeReturnedEquals: "404",
          },
          Redirect: {
            ReplaceKeyWith: "first.html",
          },
        },
        {
          Condition: {
            HttpErrorCodeReturnedEquals: "404",
          },
          Redirect: {
            ReplaceKeyWith: "second.html",
          },
        },
      ],
    });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/missing.html"),
      new Response("Missing", { status: 404 }),
    );

    assertResponseStatus(res, 301);
    assertIdentical(
      res.headers.get("location"),
      "http://foo-site.s3-website.localhost/first.html",
    );
  });

  it("uses the configured redirect status code", () => {
    const website = new SimS3BucketWebsite({
      RoutingRules: [
        {
          Condition: {
            HttpErrorCodeReturnedEquals: "404",
          },
          Redirect: {
            HttpRedirectCode: "302",
            ReplaceKeyWith: "temporary.html",
          },
        },
      ],
    });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/missing.html"),
      new Response("Missing", { status: 404 }),
    );

    assertResponseStatus(res, 302);
    assertIdentical(
      res.headers.get("location"),
      "http://foo-site.s3-website.localhost/temporary.html",
    );
  });

  it("redirects to the configured host and protocol from a routing rule", () => {
    const website = new SimS3BucketWebsite({
      RoutingRules: [
        {
          Condition: {
            KeyPrefixEquals: "external/",
          },
          Redirect: {
            HostName: "example.test",
            Protocol: "https",
            ReplaceKeyPrefixWith: "archive/",
          },
        },
      ],
    });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/external/page.html"),
      new Response("OK", { status: 200 }),
    );

    assertResponseStatus(res, 301);
    assertIdentical(
      res.headers.get("location"),
      "https://example.test/archive/page.html",
    );
  });
});

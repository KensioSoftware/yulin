import {
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { S3BucketWebsite } from "./s3-bucket-website.js";

describe("S3 Bucket static website configuration", () => {
  it("is disabled when no website configuration is specified", () => {
    const website = new S3BucketWebsite();

    assertFalse(website.websiteEnabled());
    assertFalse(website.redirectsAllRequests());
    assertUndefined(website.errorDocumentKey());
  });

  it("is enabled when an index document is specified", () => {
    const website = new S3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertTrue(website.websiteEnabled());
  });

  it("is enabled when an error document is specified", () => {
    const website = new S3BucketWebsite({
      ErrorDocument: {
        Key: "error.html",
      },
    });

    assertTrue(website.websiteEnabled());
    assertIdentical(website.errorDocumentKey(), "error.html");
  });

  it("is enabled when all requests are redirected", () => {
    const website = new S3BucketWebsite({
      RedirectAllRequestsTo: {
        HostName: "example.com",
        Protocol: "https",
      },
    });

    assertTrue(website.websiteEnabled());
    assertTrue(website.redirectsAllRequests());
  });

  it("is enabled when a routing rule redirect is specified", () => {
    const website = new S3BucketWebsite({
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
    const website = new S3BucketWebsite({
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

  it("resolves the root request to the index document", () => {
    const website = new S3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertIdentical(website.objectKeyForRequest(""), "index.html");
  });

  it("resolves a folder request to the folder index document", () => {
    const website = new S3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertIdentical(website.objectKeyForRequest("foo/"), "foo/index.html");
  });

  it("leaves a non-folder object key unchanged when an index document is configured", () => {
    const website = new S3BucketWebsite({
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
    const website = new S3BucketWebsite();

    assertIdentical(website.objectKeyForRequest("foo/"), "foo/");
    assertIdentical(
      website.objectKeyForRequest("foo/page.html"),
      "foo/page.html",
    );
  });

  it("redirects all requests to the configured host and protocol", () => {
    const website = new S3BucketWebsite({
      RedirectAllRequestsTo: {
        HostName: "example.com",
        Protocol: "https",
      },
    });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/docs/index.html"),
      new Response("Original response", { status: 200 }),
    );

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "https://example.com/docs/index.html",
    );
  });

  it("leaves the response unchanged when the website is disabled", () => {
    const website = new S3BucketWebsite();
    const originalResponse = new Response("Original response", { status: 404 });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/missing.html"),
      originalResponse,
    );

    assertIdentical(res, originalResponse);
  });

  it("redirects when HttpErrorCodeReturnedEquals matches the response status", () => {
    const website = new S3BucketWebsite({
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
    });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/missing.html"),
      new Response("Missing", { status: 404 }),
    );

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "http://foo-site.s3-website.localhost/not-found.html",
    );
  });

  it("does not redirect when HttpErrorCodeReturnedEquals does not match the response status", () => {
    const website = new S3BucketWebsite({
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
    });
    const originalResponse = new Response("OK", { status: 200 });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/index.html"),
      originalResponse,
    );

    assertIdentical(res, originalResponse);
  });

  it("redirects when KeyPrefixEquals matches the request key", () => {
    const website = new S3BucketWebsite({
      RoutingRules: [
        {
          Condition: {
            KeyPrefixEquals: "old/",
          },
          Redirect: {
            ReplaceKeyPrefixWith: "new/",
          },
        },
      ],
    });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/old/page.html"),
      new Response("OK", { status: 200 }),
    );

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "http://foo-site.s3-website.localhost/new/page.html",
    );
  });

  it("redirects when a routing rule has no condition", () => {
    const website = new S3BucketWebsite({
      RoutingRules: [
        {
          Redirect: {
            ReplaceKeyWith: "redirected.html",
          },
        },
      ],
    });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/anything.html"),
      new Response("OK", { status: 200 }),
    );

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "http://foo-site.s3-website.localhost/redirected.html",
    );
  });

  it("does not redirect when KeyPrefixEquals does not match the request key", () => {
    const website = new S3BucketWebsite({
      RoutingRules: [
        {
          Condition: {
            KeyPrefixEquals: "old/",
          },
          Redirect: {
            ReplaceKeyPrefixWith: "new/",
          },
        },
      ],
    });
    const originalResponse = new Response("OK", { status: 200 });

    const res = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/current/page.html"),
      originalResponse,
    );

    assertIdentical(res, originalResponse);
  });

  it("requires all specified routing rule conditions to match", () => {
    const website = new S3BucketWebsite({
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
    const website = new S3BucketWebsite({
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

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "http://foo-site.s3-website.localhost/first.html",
    );
  });

  it("uses the configured redirect status code", () => {
    const website = new S3BucketWebsite({
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

    assertIdentical(res.status, 302);
    assertIdentical(
      res.headers.get("location"),
      "http://foo-site.s3-website.localhost/temporary.html",
    );
  });

  it("redirects to the configured host and protocol from a routing rule", () => {
    const website = new S3BucketWebsite({
      RoutingRules: [
        {
          Condition: {
            KeyPrefixEquals: "external/",
          },
          Redirect: {
            HostName: "example.com",
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

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "https://example.com/archive/page.html",
    );
  });
});

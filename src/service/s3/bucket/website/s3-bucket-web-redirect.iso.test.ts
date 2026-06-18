import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { S3BucketWebsite } from "./s3-bucket-website.js";

describe("S3 Bucket static website redirects", () => {
  it("resolves a non-slash folder request to its redirect target index document", () => {
    const website = new S3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertIdentical(
      website.folderIndexDocumentKeyForRequest("foo"),
      "foo/index.html",
    );
  });

  it("does not resolve a redirect target index document when no index document is configured", () => {
    const website = new S3BucketWebsite();

    assertUndefined(website.folderIndexDocumentKeyForRequest("foo"));
  });

  it("does not resolve a redirect target index document for slash-terminated folder requests", () => {
    const website = new S3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertUndefined(website.folderIndexDocumentKeyForRequest("foo/"));
  });

  it("redirects all requests to the configured host and protocol", () => {
    const website = new S3BucketWebsite({
      RedirectAllRequestsTo: {
        HostName: "example.test",
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
      "https://example.test/docs/index.html",
    );
  });

  it("redirects to the same path with a trailing slash", () => {
    const website = new S3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    const res = website.trailingSlashRedirect(
      new Request("http://foo-site.s3-website.localhost/docs?x=1"),
    );

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "http://foo-site.s3-website.localhost/docs/?x=1",
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
});

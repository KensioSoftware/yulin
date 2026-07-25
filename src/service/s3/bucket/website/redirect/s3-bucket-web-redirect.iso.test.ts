import {
  assertIdentical,
  assertResponseStatus,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3BucketWebsite } from "../sim-s3-bucket-website.js";

describe("S3 Bucket static website redirects", () => {
  it("resolves a non-slash folder request to its redirect target index document", () => {
    const website = new SimS3BucketWebsite({
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
    const website = new SimS3BucketWebsite();

    assertUndefined(website.folderIndexDocumentKeyForRequest("foo"));
  });

  it("does not resolve a redirect target index document for slash-terminated folder requests", () => {
    const website = new SimS3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    assertUndefined(website.folderIndexDocumentKeyForRequest("foo/"));
  });

  it("redirects all requests to the configured host and protocol", () => {
    const website = new SimS3BucketWebsite({
      RedirectAllRequestsTo: {
        HostName: "example.test",
        Protocol: "https",
      },
    });

    const response = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/docs/index.html"),
      new Response("Original response", { status: 200 }),
    );

    assertResponseStatus(response, 301);
    assertIdentical(
      response.headers.get("location"),
      "https://example.test/docs/index.html",
    );
  });

  it("redirects to the same path with a trailing slash", () => {
    const website = new SimS3BucketWebsite({
      IndexDocument: {
        Suffix: "index.html",
      },
    });

    const response = website.trailingSlashRedirect(
      new Request("http://foo-site.s3-website.localhost/docs?x=1"),
    );

    assertResponseStatus(response, 301);
    assertIdentical(
      response.headers.get("location"),
      "http://foo-site.s3-website.localhost/docs/?x=1",
    );
  });

  it("leaves the response unchanged when the website is disabled", () => {
    const website = new SimS3BucketWebsite();
    const originalResponse = new Response("Original response", { status: 404 });

    const response = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/missing.html"),
      originalResponse,
    );

    assertIdentical(response, originalResponse);
  });

  it("redirects when HttpErrorCodeReturnedEquals matches the response status", () => {
    const website = new SimS3BucketWebsite({
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

    const response = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/missing.html"),
      new Response("Missing", { status: 404 }),
    );

    assertResponseStatus(response, 301);
    assertIdentical(
      response.headers.get("location"),
      "http://foo-site.s3-website.localhost/not-found.html",
    );
  });

  it("does not redirect when HttpErrorCodeReturnedEquals does not match the response status", () => {
    const website = new SimS3BucketWebsite({
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

    const response = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/index.html"),
      originalResponse,
    );

    assertIdentical(response, originalResponse);
  });

  it("redirects when KeyPrefixEquals matches the request key", () => {
    const website = new SimS3BucketWebsite({
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

    const response = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/old/page.html"),
      new Response("OK", { status: 200 }),
    );

    assertResponseStatus(response, 301);
    assertIdentical(
      response.headers.get("location"),
      "http://foo-site.s3-website.localhost/new/page.html",
    );
  });

  it("redirects when a routing rule has no condition", () => {
    const website = new SimS3BucketWebsite({
      RoutingRules: [
        {
          Redirect: {
            ReplaceKeyWith: "redirected.html",
          },
        },
      ],
    });

    const response = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/anything.html"),
      new Response("OK", { status: 200 }),
    );

    assertResponseStatus(response, 301);
    assertIdentical(
      response.headers.get("location"),
      "http://foo-site.s3-website.localhost/redirected.html",
    );
  });

  it("does not redirect when KeyPrefixEquals does not match the request key", () => {
    const website = new SimS3BucketWebsite({
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

    const response = website.redirectForRequestResponse(
      new Request("http://foo-site.s3-website.localhost/current/page.html"),
      originalResponse,
    );

    assertIdentical(response, originalResponse);
  });
});

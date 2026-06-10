import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAwsLocalUrl } from "./sim-aws-local-url.js";

describe("Simulated AWS local URL", () => {
  it("adds local URL details to a simulated AWS URL", () => {
    const url = new SimAwsLocalUrl({
      input: "https://my-site.s3-website.eu-west-2.sim-aws.localhost/foo/",
      port: "12345",
    });

    assertIdentical(
      url.toString(),
      "http://my-site.s3-website.eu-west-2.sim-aws.localhost:12345/foo/",
    );
  });

  it("replaces an AWS S3 hostname suffix with the local hostname suffix", () => {
    const url = new SimAwsLocalUrl({
      input: "https://my-site.s3.eu-west-2.amazonaws.com/foo/index.html",
      port: "12345",
    });

    assertIdentical(
      url.toString(),
      "http://my-site.s3.eu-west-2.sim-aws.localhost:12345/foo/index.html",
    );
  });

  it("adds the local hostname suffix to other hostnames", () => {
    const url = new SimAwsLocalUrl({
      input: "https://www.example.com/foo/",
      port: "12345",
    });

    assertIdentical(
      url.toString(),
      "http://www.example.com.sim-aws.localhost:12345/foo/",
    );
  });

  it("converts to a URL instance", () => {
    const url = new SimAwsLocalUrl({
      input: new URL(
        "https://my-site.s3-website.eu-west-2.sim-aws.localhost/foo/",
      ),
      port: "12345",
    }).toURL();

    assertInstanceOf(url, URL);
    assertIdentical(
      url.toString(),
      "http://my-site.s3-website.eu-west-2.sim-aws.localhost:12345/foo/",
    );
  });

  it("removes the localhost suffix from a URL", () => {
    const originalUrl = new SimAwsLocalUrl({
      input: "http://ed4k18jw3kpctq.cloudfront.net.sim-aws.localhost/foo/",
    });
    assertIdentical(
      originalUrl.toString(),
      "http://ed4k18jw3kpctq.cloudfront.net.sim-aws.localhost/foo/",
    );

    const trimmedUrl = originalUrl.withoutLocalhostSuffix();
    assertIdentical(
      trimmedUrl.toString(),
      "http://ed4k18jw3kpctq.cloudfront.net/foo/",
    );
  });
});

import { describe, it } from "vitest";
import { assertIdentical } from "@kensio/smartass";
import { simAwsRequestHostname } from "./sim-aws-request-hostname.js";

describe("AWS-facing hostname of a request", () => {
  it("drops the localhost suffix and the local server port", () => {
    const request = new Request(
      "http://distro123.cloudfront.net.sim-aws.localhost:52341/index.html",
    );

    assertIdentical(simAwsRequestHostname(request), "distro123.cloudfront.net");
  });

  it("keeps a hostname that has no localhost suffix", () => {
    const request = new Request("https://cdn.example.test/index.html");

    assertIdentical(simAwsRequestHostname(request), "cdn.example.test");
  });

  it("prefers the Host header over the URL hostname", () => {
    const request = new Request("http://127.0.0.1:52341/index.html", {
      headers: { host: "cdn.example.test.sim-aws.localhost:52341" },
    });

    assertIdentical(simAwsRequestHostname(request), "cdn.example.test");
  });
});

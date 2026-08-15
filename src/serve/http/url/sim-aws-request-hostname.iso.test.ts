import { describe, it } from "vitest";
import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
import {
  isSimAwsLocalRequest,
  simAwsRequestHostname,
} from "./sim-aws-request-hostname.js";

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

describe("Whether a request reached the local server under its suffix", () => {
  it("reports a request carrying the localhost suffix", () => {
    // Given a request made to a simulated hostname under the local suffix
    const request = new Request(
      "http://api.example.test.sim-aws.localhost:52341/orders",
    );

    // Then the port it carries is the local server's rather than one the
    // client chose
    assertTrue(isSimAwsLocalRequest(request));
  });

  it("reports a request made to the hostname itself", () => {
    // Given a request made to the hostname an application really uses, which
    // is what a resolver pointed at the simulator makes possible
    const request = new Request("http://api.example.test:8080/orders");

    // Then the port it carries is the client's own
    assertFalse(isSimAwsLocalRequest(request));
  });

  it("reads the Host header a client sent", () => {
    // Given a request whose URL names an address and whose Host header names
    // the local hostname, as a served request does
    const request = new Request("http://127.0.0.1:52341/orders", {
      headers: { host: "api.example.test.sim-aws.localhost:52341" },
    });

    // Then the header decides it, as it does for the hostname itself
    assertTrue(isSimAwsLocalRequest(request));
  });
});

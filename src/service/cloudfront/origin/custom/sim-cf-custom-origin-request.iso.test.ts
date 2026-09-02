import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCfForwardedToOrigin } from "../../origin-request-policy/sim-cf-forwarded-to-origin.js";
import { SimCfOriginRequestForwarding } from "../../origin-request-policy/sim-cf-origin-request-forwarding.js";
import { simCfCustomOriginRequest } from "./sim-cf-custom-origin-request.js";

describe("Building a CloudFront custom Origin request", () => {
  const forwarded = new SimCfForwardedToOrigin({
    forwarding: new SimCfOriginRequestForwarding({
      headerBehavior: "allViewer",
    }),
  });

  function forwardedOrigin(properties: {
    readonly viewerUrl: string;
    readonly origin: string;
    readonly viewerProtocolPolicy:
      | "allow-all"
      | "redirect-to-https"
      | "https-only";
  }): string | null {
    const request = simCfCustomOriginRequest({
      domainName: "api123.execute-api.eu-west-2.amazonaws.com",
      originPath: "",
      request: new Request(properties.viewerUrl, {
        headers: { origin: properties.origin },
      }),
      viewerProtocolPolicy: properties.viewerProtocolPolicy,
      forwarded,
    });

    return request.headers.get("origin");
  }

  it("sends the HTTPS CloudFront origin for a local HTTPS-only viewer", () => {
    // Given a browser request made to a local Distribution URL.
    const localOrigin =
      "http://distro123.cloudfront.net.sim-aws.localhost:5173";

    // When CloudFront forwards its same-origin header to a custom Origin.
    const origin = forwardedOrigin({
      viewerUrl: `${localOrigin}/do/basket/add`,
      origin: localOrigin,
      viewerProtocolPolicy: "redirect-to-https",
    });

    // Then the custom Origin sees the AWS-facing HTTPS origin.
    assertIdentical(origin, "https://distro123.cloudfront.net");
  });

  it("keeps HTTP for a local viewer allowed to use it", () => {
    // Given a local Distribution request on a Behavior allowing HTTP.
    const localOrigin =
      "http://distro123.cloudfront.net.sim-aws.localhost:5173";

    // When CloudFront forwards its same-origin header.
    const origin = forwardedOrigin({
      viewerUrl: `${localOrigin}/do/basket/add`,
      origin: localOrigin,
      viewerProtocolPolicy: "allow-all",
    });

    // Then the AWS-facing origin keeps the viewer protocol.
    assertIdentical(origin, "http://distro123.cloudfront.net");
  });

  it("translates an alternate domain name", () => {
    // Given a browser request made through a local alternate domain name.
    const localOrigin = "http://shop.example.test.sim-aws.localhost:5173";

    // When CloudFront forwards its same-origin header.
    const origin = forwardedOrigin({
      viewerUrl: `${localOrigin}/do/basket/add`,
      origin: localOrigin,
      viewerProtocolPolicy: "https-only",
    });

    // Then the custom Origin sees the AWS-facing alternate domain name.
    assertIdentical(origin, "https://shop.example.test");
  });

  it("keeps a cross-origin local value", () => {
    // Given a local Distribution request carrying another local site's Origin.
    const crossOrigin = "http://admin.example.test.sim-aws.localhost:5173";

    // When CloudFront forwards that cross-origin header.
    const origin = forwardedOrigin({
      viewerUrl:
        "http://shop.example.test.sim-aws.localhost:5173/do/basket/add",
      origin: crossOrigin,
      viewerProtocolPolicy: "redirect-to-https",
    });

    // Then the unrelated value is unchanged.
    assertIdentical(origin, crossOrigin);
  });

  it("keeps an AWS-facing value", () => {
    // Given an in-process request carrying the AWS-facing Origin already.
    const awsOrigin = "https://distro123.cloudfront.net";

    // When CloudFront forwards the header.
    const origin = forwardedOrigin({
      viewerUrl: `${awsOrigin}/do/basket/add`,
      origin: awsOrigin,
      viewerProtocolPolicy: "redirect-to-https",
    });

    // Then the in-process value is unchanged.
    assertIdentical(origin, awsOrigin);
  });
});

import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simCloudFrontBehaviorFactory } from "../../behaviour/sim-cloud-front-behavior.js";
import { SimCloudFrontNoSuchResponseHeadersPolicy } from "../../error/sim-cloudfront.error.js";
import { SimCloudFrontResponseHeader } from "../../response-headers-policy/sim-cf-response-header.js";
import { SimCloudFrontResponseHeadersPolicy } from "../../response-headers-policy/sim-cf-response-headers-policy.js";
import { SimCloudFront } from "../../sim-cloudfront.js";
import { SimCfResponseHeadersApplicator } from "./sim-cf-response-headers-applicator.js";

describe("SimCfResponseHeadersApplicator", () => {
  const applicator = new SimCfResponseHeadersApplicator();

  function policy(): SimCloudFrontResponseHeadersPolicy {
    return new SimCloudFrontResponseHeadersPolicy({
      name: "CacheHeaders",
      customHeaders: [
        new SimCloudFrontResponseHeader({
          name: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
          override: true,
        }),
      ],
    });
  }

  it("applies the policy a Behavior names", () => {
    // Given a Behavior naming a policy the simulation holds.
    const cloudFront = new SimCloudFront();
    const responseHeadersPolicy = policy();

    cloudFront.addResponseHeadersPolicy(responseHeadersPolicy);

    const behaviour = simCloudFrontBehaviorFactory.make({
      responseHeadersPolicyId: responseHeadersPolicy.id,
    });

    // When an Origin response passes through it.
    const response = applicator.apply(
      cloudFront,
      new Request("https://distro123.cloudfront.net/"),
      new Response("body"),
      behaviour,
    );

    // Then the policy's headers are on what the viewer gets.
    assertIdentical(
      response.headers.get("cache-control"),
      "public, max-age=0, must-revalidate",
    );
  });

  it("passes a response through for a Behavior naming no policy", () => {
    // Given a Behavior with no response headers policy.
    const cloudFront = new SimCloudFront();
    const behaviour = simCloudFrontBehaviorFactory.make();

    // When an Origin response passes through it.
    const originResponse = new Response("body");
    const response = applicator.apply(
      cloudFront,
      new Request("https://distro123.cloudfront.net/"),
      originResponse,
      behaviour,
    );

    // Then nothing is done to it at all.
    assertIdentical(response, originResponse);
  });

  it("refuses a policy ID nothing created", () => {
    // Given a Behavior naming a policy the simulation does not hold, which is
    // what a CloudFront managed policy ID is here.
    const cloudFront = new SimCloudFront();
    const behaviour = simCloudFrontBehaviorFactory.make({
      responseHeadersPolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
    });

    // When an Origin response passes through it, then the gap is reported
    // rather than the response being served without the headers it promised.
    const error = assertThrowsError(() =>
      applicator.apply(
        cloudFront,
        new Request("https://distro123.cloudfront.net/"),
        new Response("body"),
        behaviour,
      ),
    );

    assertInstanceOf(error, SimCloudFrontNoSuchResponseHeadersPolicy);
    assertStringIncludes(error.message, "658327ea-f89d-4fab-a63d-7e88639e58f6");
    assertStringIncludes(error.message, "does not exist");
  });

  it("forgets a policy that has been removed", () => {
    // Given a policy the simulation held and no longer does, as a deleted
    // CloudFormation Resource leaves it.
    const cloudFront = new SimCloudFront();
    const responseHeadersPolicy = policy();

    cloudFront.addResponseHeadersPolicy(responseHeadersPolicy);
    cloudFront.removeResponseHeadersPolicy(responseHeadersPolicy.id);

    // Then looking it up finds nothing.
    assertUndefined(
      cloudFront.getResponseHeadersPolicyById(responseHeadersPolicy.id),
    );
  });
});

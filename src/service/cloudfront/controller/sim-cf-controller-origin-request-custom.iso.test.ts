import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { LambdaAtEdge } from "../typings/lambda-at-edge.namespace.js";
import { makeEdgeFunctionVersionArn } from "../../../../test/cloudfront/edge-function-fixture.js";
import {
  customOrigin,
  edgeOriginDistributionHostname,
  edgeOriginViewerFetch,
  functionUrlHostname,
  respondingWith,
} from "../../../../test/cloudfront/edge-origin-fixture.js";

describe("Simulated CloudFront origin-request Lambda@Edge on a custom Origin", () => {
  it("sends the fetch to the Origin a function rewrote the domain name to", async () => {
    // Given two services behind two Origins of one Distribution.
    const simAws = new SimAws();
    const primaryHost = await functionUrlHostname(
      simAws,
      "primary-origin",
      respondingWith("From the primary Origin"),
    );
    const failoverHost = await functionUrlHostname(
      simAws,
      "failover-origin",
      respondingWith("From the failover Origin"),
    );

    // And a function moving the request to the second one.
    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "route-origin",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;
        assertNonNullable(request.origin.custom, "the Origin is a custom one");
        request.origin.custom.domainName = failoverHost;

        return request;
      },
    });

    const distroHostname = await edgeOriginDistributionHostname(
      simAws,
      [
        customOrigin("primary", primaryHost),
        customOrigin("failover", failoverHost),
      ],
      [{ EventType: "origin-request", LambdaFunctionARN: versionArn }],
    );

    // When a request arrives for the Behavior targeting the first Origin.
    const response = await edgeOriginViewerFetch(
      simAws,
      distroHostname,
      "/greeting",
    );

    // Then the second Origin is the one that answered.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "From the failover Origin");
  });

  it("reaches the Origin with a custom header a function added", async () => {
    // Given an Origin telling the viewer which header it was sent.
    const simAws = new SimAws();
    const originHost = await functionUrlHostname(
      simAws,
      "header-reading-origin",
      (event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event.headers),
      }),
    );

    // And a function adding that header to the Origin request.
    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "add-origin-header",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;
        assertNonNullable(request.origin.custom, "the Origin is a custom one");
        request.origin.custom.customHeaders["x-origin-secret"] = [
          { key: "X-Origin-Secret", value: "from-the-edge" },
        ];

        return request;
      },
    });

    const distroHostname = await edgeOriginDistributionHostname(
      simAws,
      [customOrigin("api", originHost)],
      [{ EventType: "origin-request", LambdaFunctionARN: versionArn }],
    );

    // When a viewer that sent no such header makes a request.
    const response = await edgeOriginViewerFetch(
      simAws,
      distroHostname,
      "/greeting",
    );

    // Then the Origin was sent it, and it is nowhere in what the viewer got
    // back.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertStringIncludes(await response.text(), "from-the-edge");
    assertIdentical(response.headers.get("x-origin-secret"), null);
  });

  it("fails the request when a function moved the Origin to a domain naming nothing here", async () => {
    // Given a function pointing the Origin at a domain outside the simulation.
    const simAws = new SimAws();
    const originHost = await functionUrlHostname(
      simAws,
      "reachable-origin",
      respondingWith("Never served"),
    );

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "route-off-simulation",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;
        assertNonNullable(request.origin.custom, "the Origin is a custom one");
        request.origin.custom.domainName = "api.example.test";

        return request;
      },
    });

    const distroHostname = await edgeOriginDistributionHostname(
      simAws,
      [customOrigin("api", originHost)],
      [{ EventType: "origin-request", LambdaFunctionARN: versionArn }],
    );

    // When a request arrives.
    const response = await edgeOriginViewerFetch(
      simAws,
      distroHostname,
      "/greeting",
    );

    // Then it fails the way a misconfigured Origin does, naming the domain
    // rather than the request being sent to the real one.
    assertResponseStatus(response, 500, await describeResponse(response));
    assertStringIncludes(
      await response.text(),
      "does not resolve to a simulated AWS service",
    );
  });

  it("answers with a 502 when a function turned a custom Origin into an S3 Origin", async () => {
    // Given a function handing back the other kind of Origin.
    const simAws = new SimAws();
    const originHost = await functionUrlHostname(
      simAws,
      "swapped-custom-origin",
      respondingWith("Never served"),
    );

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "swap-to-s3",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;

        request.origin = {
          s3: {
            authMethod: "none",
            customHeaders: {},
            domainName: "assets.s3.amazonaws.com",
            path: "",
            region: "us-east-1",
          },
        };

        return request;
      },
    });

    const distroHostname = await edgeOriginDistributionHostname(
      simAws,
      [customOrigin("api", originHost)],
      [{ EventType: "origin-request", LambdaFunctionARN: versionArn }],
    );

    // When a request arrives.
    const response = await edgeOriginViewerFetch(
      simAws,
      distroHostname,
      "/greeting",
    );

    // Then the viewer gets the 502 a failed edge function gets, saying what
    // this simulation could not do.
    assertResponseStatus(response, 502, await describeResponse(response));
    assertStringIncludes(
      await response.text(),
      "Switching an Origin between the two kinds is not simulated",
    );
  });
});

import {
  assertFalse,
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCognitoHosted } from "../../../../../test/cognito/federation-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimElbV2Result } from "../../../elbv2/serve/sim-elbv2-event.type.js";
import { simElbV2LambdaTargetFactory } from "../../../elbv2/serve/sim-elbv2-lambda-target.factory.js";
import { makeSimLambdaOutboundHttp } from "./sim-lambda-outbound-http.factory.js";

describe("What a simulated environment answers its functions for", () => {
  it("serves the AWS service API endpoints and the hostnames it resolves", async () => {
    // Given a simulation with a pool served on a hosted domain.
    const setUp = await simCognitoHosted();
    const outbound = makeSimLambdaOutboundHttp({
      simAws: setUp.simAws,
      regionName: "eu-west-2",
    });

    // Then an AWS service API endpoint is the simulation's to answer.
    assertTrue(outbound.serves("dynamodb.eu-west-2.amazonaws.com"));

    // And so is the hostname the pool's domain is served on, which is not one
    // of those.
    assertTrue(outbound.serves(setUp.domainHost));

    // And a hostname the simulation serves nothing at is not.
    assertFalse(outbound.serves("api.example.com"));
  });

  it("answers a hostname simulated Route53 resolves", async () => {
    // Given the same simulation.
    const setUp = await simCognitoHosted();
    const outbound = makeSimLambdaOutboundHttp({ simAws: setUp.simAws });

    // When a request arrives for the pool's hosted domain.
    const response = await outbound.fetch(
      new Request(`https://${setUp.domainHost}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "grant_type=authorization_code",
      }),
    );

    // Then the simulated domain answered it, as it answers a browser: the
    // request named no app client, so it is refused rather than routed
    // somewhere else.
    assertResponseStatus(response, 400, await describeResponse(response));
    assertIdentical(
      ((await response.json()) as { error: string }).error,
      "invalid_client",
    );
  });

  it("serves a document an AWS service API endpoint publishes", async () => {
    // Given a simulation with a user pool.
    const setUp = await simCognitoHosted();
    const outbound = makeSimLambdaOutboundHttp({ simAws: setUp.simAws });

    // When a request arrives for the pool's JWKS at the regional Cognito
    // endpoint, carrying no Command and nothing to sign it with.
    const response = await outbound.fetch(
      new Request(
        `https://cognito-idp.eu-west-2.amazonaws.com/${setUp.userPoolId}/.well-known/jwks.json`,
      ),
    );

    // Then the pool published it, as it publishes it to a browser.
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("leaves a signed request to a service endpoint to be routed as a Command", async () => {
    // Given a simulation, and a signed request to a service whose endpoint it
    // does serve over HTTP.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const outbound = makeSimLambdaOutboundHttp({ simAws });

    // When it arrives.
    const error = await assertThrowsErrorAsync(async () =>
      outbound.fetch(
        new Request("https://data.s3.eu-west-2.amazonaws.com/greeting.txt", {
          headers: {
            authorization:
              "AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE/20260818/eu-west-2/" +
              "s3/aws4_request, SignedHeaders=host, Signature=00",
          },
        }),
      ),
    );

    // Then it was read as the AWS API request it is, and refused as one, so
    // that a bundled SDK is told what to do about the protocol its requests
    // cannot be routed back from.
    assertStringIncludes(error.message, "request to s3");
    assertStringIncludes(error.message, "AWS JSON protocol");
  });

  it("refuses an endpoint it serves nothing at with what a Command would say", async () => {
    // Given a simulation, and an unsigned request to a service endpoint
    // nothing in it answers for.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const outbound = makeSimLambdaOutboundHttp({ simAws });

    // When it arrives.
    const error = await assertThrowsErrorAsync(async () =>
      outbound.fetch(new Request("https://sts.eu-west-2.amazonaws.com/")),
    );

    // Then the refusal names the endpoint and says why, rather than reporting
    // a local hostname the request never named.
    assertStringIncludes(error.message, "sts.eu-west-2.amazonaws.com");
  });

  it("prefers a hostname it resolves to the AWS suffix that hostname ends with", async () => {
    // Given a load balancer, whose own DNS name AWS issues under
    // `.elb.amazonaws.com`.
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      {
        handler: (): SimElbV2Result => ({
          statusCode: 200,
          body: JSON.stringify({ ordered: true }),
        }),
      },
      simAws,
    );
    const outbound = makeSimLambdaOutboundHttp({ simAws });

    // When a request arrives for it.
    const response = await outbound.fetch(
      new Request(`http://${loadBalancer.dnsName}/orders`),
    );

    // Then the load balancer answered, because the hostname it resolves to is
    // the more specific answer to what serves it.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), '{"ordered":true}');
  });
});

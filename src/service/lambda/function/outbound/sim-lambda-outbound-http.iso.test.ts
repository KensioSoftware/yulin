import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
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
    assertIdentical(response.status, 400);
    assertIdentical(
      ((await response.json()) as { error: string }).error,
      "invalid_client",
    );
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
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), '{"ordered":true}');
  });
});

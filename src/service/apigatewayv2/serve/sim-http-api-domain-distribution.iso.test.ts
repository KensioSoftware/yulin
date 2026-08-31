import {
  CreateApiMappingCommand,
  CreateDomainNameCommand,
} from "@aws-sdk/client-apigatewayv2";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { assertIsSimRoute53HostedZoneId } from "../../route53/command/create-hosted-zone/sim-route53-zone-id.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import type { SimHttpApiDomainName } from "../domain/sim-http-api-domain-name.js";

const viewerHostname = "www.example.test";

/**
 * The header the Distribution adds to every Origin request, which is how the
 * API behind it tells a request that came through the Distribution from one
 * that reached it directly.
 */
const originSecretHeader = "x-origin-secret";
const originSecret = "3f9c1d";

/**
 * An API answering only a request carrying the Origin's own header, which is
 * the shape a Distribution in front of an API is given so nothing reaches the
 * API around it.
 */
async function apiBehindOriginSecret(simAws: SimAws): Promise<SimHttpApi> {
  return await simHttpApiLambdaProxyFactory.make(
    {
      routeKeys: ["GET /{proxy+}"],
      handler: () => "served",
      requestAuthorizer: {
        functionName: "origin-secret-authorizer",
        handler: (event: { identitySource: string[] }) => ({
          isAuthorized: event.identitySource[0] === originSecret,
        }),
        identitySource: [`$request.header.${originSecretHeader}`],
        enableSimpleResponses: true,
        invokePermission: true,
      },
    },
    simAws,
  );
}

/**
 * Put a Distribution in front of a hostname, with the API's Origin adding the
 * header the API requires, and a record sending the viewer's name to it.
 */
async function distributionInFrontOf(
  simAws: SimAws,
  originDomainName: string,
): Promise<void> {
  const creation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "api-distribution",
        Comment: "API CDN",
        Enabled: true,
        Aliases: { Quantity: 1, Items: [viewerHostname] },
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "ApiOrigin",
              DomainName: originDomainName,
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: "https-only",
              },
              CustomHeaders: {
                Quantity: 1,
                Items: [
                  {
                    HeaderName: originSecretHeader,
                    HeaderValue: originSecret,
                  },
                ],
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "ApiOrigin",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  const distributionHostname = creation.Distribution?.DomainName;
  assertNonNullable(distributionHostname);

  const simRoute53 = simAws.route53();
  const zone = await simRoute53.createHostedZone({
    input: { Name: "example.test", CallerReference: "api-distribution" },
  });
  const hostedZoneId = zone.HostedZone?.Id;
  assertIsSimRoute53HostedZoneId(hostedZoneId);

  await simRoute53.changeResourceRecordSets({
    input: {
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: viewerHostname,
              Type: "A",
              AliasTarget: {
                DNSName: distributionHostname,
                HostedZoneId: "Z2FDTNDATAQYW2",
                EvaluateTargetHealth: false,
              },
            },
          },
        ],
      },
    },
  });

  await simAws.backgroundTasksComplete();
}

/**
 * The stack in the report this covers: an API behind an Origin header, a
 * custom domain carrying the viewer's own hostname, and a Distribution
 * serving that hostname with the domain's regional endpoint as its Origin.
 */
async function apiBehindDistribution(
  simAws: SimAws,
): Promise<SimHttpApiDomainName> {
  const api = await apiBehindOriginSecret(simAws);
  await simAws
    .apiGatewayV2()
    .createDomainName(
      new CreateDomainNameCommand({ DomainName: viewerHostname }),
    );
  const domain = simAws.apiGatewayV2().findDomainName(viewerHostname);
  assertNonNullable(domain);

  await simAws.apiGatewayV2().createApiMapping(
    new CreateApiMappingCommand({
      DomainName: viewerHostname,
      ApiId: api.apiId,
      Stage: "$default",
    }),
  );
  await distributionInFrontOf(simAws, domain.regionalDomainName);

  return domain;
}

function viewerRequest(simAws: SimAws): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `https://${viewerHostname}/anything`,
    }).toString(),
  );
}

describe("A Distribution serving the hostname an HTTP API also has as a custom domain", () => {
  it("reaches the API through the Distribution once the domain is created", async () => {
    // Given a Distribution serving a hostname in front of an API that answers
    // only requests carrying the Origin's own header
    const simAws = new SimAws();
    await apiBehindDistribution(simAws);

    // When a viewer asks for the hostname
    const response = await viewerRequest(simAws);

    // Then the request went through the Distribution, so it carried the
    // header the API requires. Giving the API the viewer's hostname as a
    // custom domain leaves the record deciding where that hostname goes
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.json(), "served");
  });

  it("refuses a viewer reaching the API around the Distribution", async () => {
    // Given the same stack
    const simAws = new SimAws();
    const domain = await apiBehindDistribution(simAws);

    // When the domain's regional endpoint is asked for directly
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({
        input: `https://${domain.regionalDomainName}/anything`,
      }).toString(),
    );

    // Then the authorizer refuses it, since nothing added the Origin header
    assertResponseStatus(response, 401, await describeResponse(response));
    expect(await response.json()).toStrictEqual({ message: "Unauthorized" });
  });
});

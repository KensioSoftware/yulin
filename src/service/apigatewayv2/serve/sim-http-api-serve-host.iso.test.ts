import {
  CreateApiMappingCommand,
  CreateDomainNameCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { simHttpApiLogicalHost } from "../api/sim-http-api-host.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

function localUrl(hostname: string, path = "/"): string {
  return new SimAwsLocalUrl({ input: `https://${hostname}${path}` }).toString();
}

/**
 * Point a hostname at an API's generated endpoint with a Route53 CNAME, which
 * is a name reaching the API that the API itself knows nothing about.
 */
async function cnameTo(
  simAws: SimAws,
  hostname: string,
  api: SimHttpApi,
): Promise<void> {
  const simRoute53 = simAws.route53();
  const zone = await simRoute53.createHostedZone({
    input: { Name: "example.test", CallerReference: "host-refusal-test" },
  });
  await simRoute53.changeResourceRecordSets({
    input: {
      HostedZoneId: zone.HostedZone?.Id,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: hostname,
              Type: "CNAME",
              // The logical form of the generated endpoint, which is the
              // name simulated DNS resolves.
              ResourceRecords: [
                {
                  Value: simHttpApiLogicalHost({
                    apiId: api.apiId,
                    regionName: api.accountRegionScope.regionName,
                  }),
                },
              ],
            },
          },
        ],
      },
    },
  });
  await simAws.backgroundTasksComplete();
}

describe("Which hostnames a sim HTTP API answers on", () => {
  it("refuses a request carrying a Host it neither generated nor has mapped", async () => {
    // Given an API reachable under a name of the project's own, with no
    // custom domain telling the API to serve that name
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make({}, simAws);
    await cnameTo(simAws, "www.example.test", api);

    // When a request arrives under that name
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl("www.example.test"),
    );

    // Then the API refuses it before any route or authorizer sees it, with
    // the headers that tell this apart from CloudFront's own origin refusal
    assertIdentical(response.status, 403);
    expect(await response.json()).toStrictEqual({ message: "Forbidden" });
    assertIdentical(
      response.headers.get("x-amzn-errortype"),
      "ForbiddenException",
    );
    expect(response.headers.get("x-amzn-requestid")).not.toBeNull();
  });

  it("serves the same name once a custom domain maps it", async () => {
    // Given the same API, now with a custom domain for the name
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: () => "hello" },
      simAws,
    );
    await cnameTo(simAws, "www.example.test", api);
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "www.example.test" }),
      );
    await simAws.apiGatewayV2().createApiMapping(
      new CreateApiMappingCommand({
        DomainName: "www.example.test",
        ApiId: api.apiId,
        Stage: "$default",
      }),
    );

    // When the same request is sent again
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl("www.example.test"),
    );

    // Then the API serves it, because the domain is one it now answers on
    assertIdentical(response.status, 200);
    assertIdentical(await response.json(), "hello");
  });

  it("refuses its own generated endpoint once that endpoint is disabled", async () => {
    // Given an API reachable only through a custom domain
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { disableExecuteApiEndpoint: true },
      simAws,
    );

    // When the generated endpoint is requested anyway
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(new URL(api.apiEndpoint).hostname),
    );

    // Then it is the same refusal a Host the API never served gets, because
    // that is what the generated hostname has become
    assertIdentical(response.status, 403);
    assertIdentical(
      response.headers.get("x-amzn-errortype"),
      "ForbiddenException",
    );
  });
});

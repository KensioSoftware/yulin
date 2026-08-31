import {
  CreateApiMappingCommand,
  CreateDomainNameCommand,
} from "@aws-sdk/client-apigatewayv2";
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
import type { SimHttpApi } from "../api/sim-http-api.js";
import type { SimHttpApiDomainName } from "../domain/sim-http-api-domain-name.js";
import { simHttpApiLogicalHost } from "../api/sim-http-api-host.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

function localUrl(hostname: string, path = "/"): string {
  return new SimAwsLocalUrl({ input: `https://${hostname}${path}` }).toString();
}

/**
 * The logical form of an API's generated endpoint, which is the name
 * simulated DNS resolves.
 */
function generatedEndpointOf(api: SimHttpApi): string {
  return simHttpApiLogicalHost({
    apiId: api.apiId,
    regionName: api.accountRegionScope.regionName,
  });
}

/**
 * Give an API a custom domain of its own, mapped at the root.
 */
async function mapDomainTo(
  simAws: SimAws,
  domainName: string,
  api: SimHttpApi,
): Promise<SimHttpApiDomainName> {
  await simAws
    .apiGatewayV2()
    .createDomainName(new CreateDomainNameCommand({ DomainName: domainName }));
  await simAws.apiGatewayV2().createApiMapping(
    new CreateApiMappingCommand({
      DomainName: domainName,
      ApiId: api.apiId,
      Stage: "$default",
    }),
  );

  const domain = simAws.apiGatewayV2().findDomainName(domainName);
  assertNonNullable(domain);

  return domain;
}

/**
 * Point a hostname at another with a Route53 CNAME, which is how a name the
 * project owns reaches a hostname AWS issued.
 */
async function cnameTo(
  simAws: SimAws,
  hostname: string,
  target: string,
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
              ResourceRecords: [{ Value: target }],
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
    await cnameTo(simAws, "www.example.test", generatedEndpointOf(api));

    // When a request arrives under that name
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl("www.example.test"),
    );

    // Then the API refuses it before any route or authorizer sees it, with
    // the headers that tell this apart from CloudFront's own origin refusal
    assertResponseStatus(response, 403, await describeResponse(response));
    expect(await response.json()).toStrictEqual({ message: "Forbidden" });
    assertIdentical(
      response.headers.get("x-amzn-errortype"),
      "ForbiddenException",
    );
    expect(response.headers.get("x-amzn-requestid")).not.toBeNull();
  });

  it("refuses it still when a custom domain of that name points elsewhere", async () => {
    // Given the same API and CNAME, and a custom domain of that name mapped
    // to the API
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: () => "hello" },
      simAws,
    );
    await cnameTo(simAws, "www.example.test", generatedEndpointOf(api));
    await mapDomainTo(simAws, "www.example.test", api);

    // When the same request is sent again
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl("www.example.test"),
    );

    // Then the record still decides where the name goes, so the request
    // reaches the generated endpoint under a Host it does not answer on. The
    // custom domain has a published address of its own, and this record does
    // not point at it
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("serves the name through a record pointing at the domain's own endpoint", async () => {
    // Given the same API, with a custom domain for the name and a record
    // pointing that name at the endpoint API Gateway issued the domain
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: () => "hello" },
      simAws,
    );
    const domain = await mapDomainTo(simAws, "www.example.test", api);
    await cnameTo(simAws, "www.example.test", domain.regionalDomainName);

    // When the request is sent
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl("www.example.test"),
    );

    // Then the domain's mappings serve it, which is the pair of record and
    // domain a stack fronting an API with a name of its own deploys
    assertResponseStatus(response, 200, await describeResponse(response));
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
    assertResponseStatus(response, 403, await describeResponse(response));
    assertIdentical(
      response.headers.get("x-amzn-errortype"),
      "ForbiddenException",
    );
  });
});

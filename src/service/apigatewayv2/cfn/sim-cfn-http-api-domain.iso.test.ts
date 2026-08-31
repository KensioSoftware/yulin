import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsError,
  assertTypeString,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployHttpApi,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simHttpApiRegionalHostedZoneId } from "../domain/sim-http-api-domain-name.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

const domainName = "api.example.test";

const certificateArn =
  "arn:aws:acm:eu-west-2:111111111111:certificate/6d2c7a2e-0c7a-4d4e-9b6c-1f0a2b3c4d5e";

/** A handler reporting the path the event carried, so a base path shows up. */
const pathReportingHandler = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.rawPath,
});
`;

/**
 * The two Resources CDK's `apigatewayv2.DomainName` synthesises, with the
 * mapping depending on the stage the way CDK makes it.
 */
function domainResources(
  apiMappingKey?: string,
  domainProperties: SimCfnTemplateValueRecord = {},
): SimCfnTemplateValueRecord {
  return {
    Domain: {
      Type: "AWS::ApiGatewayV2::DomainName",
      Properties: {
        DomainName: domainName,
        DomainNameConfigurations: [
          { CertificateArn: certificateArn, EndpointType: "REGIONAL" },
        ],
        ...domainProperties,
      },
    },
    Mapping: {
      Type: "AWS::ApiGatewayV2::ApiMapping",
      DependsOn: ["Stage"],
      Properties: {
        ApiId: { Ref: "Api" },
        DomainName: { Ref: "Domain" },
        Stage: "$default",
        ...(apiMappingKey !== undefined && { ApiMappingKey: apiMappingKey }),
      },
    },
  };
}

const domainOutputs = {
  DomainRef: { Value: { Ref: "Domain" } },
  RegionalDomainName: {
    Value: { "Fn::GetAtt": ["Domain", "RegionalDomainName"] },
  },
  RegionalHostedZoneId: {
    Value: { "Fn::GetAtt": ["Domain", "RegionalHostedZoneId"] },
  },
  MappingRef: { Value: { Ref: "Mapping" } },
};

function localUrl(hostname: string, path = "/"): string {
  return new SimAwsLocalUrl({ input: `https://${hostname}${path}` }).toString();
}

describe("HTTP API custom domain CloudFormation Resources", () => {
  it("serves the API on the domain the template declared", async () => {
    // Given a template carrying an API, a stage, a domain name and a mapping
    const simAws = simAwsInEuWest2();
    await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        handlerSource: pathReportingHandler,
        routeKeys: ["GET /orders"],
        resources: domainResources(),
      }),
    );

    // When the domain's own hostname is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/orders"),
    );

    // Then the deployed API served it
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "/orders");
  });

  it("serves the API under the base path the mapping declared", async () => {
    // Given the same template with a non-empty ApiMappingKey
    const simAws = simAwsInEuWest2();
    await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        handlerSource: pathReportingHandler,
        routeKeys: ["GET /orders"],
        resources: domainResources("shop"),
      }),
    );

    // When the base path is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/shop/orders"),
    );

    // Then the route matched what was left, and the base path is gone from
    // the event, as AWS documents rawPath
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "/orders");
  });

  it("resolves Ref and the Fn::GetAtt attributes of both Resources", async () => {
    // Given the same deployed template, with the values a stack reads out
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        resources: domainResources(),
        outputs: domainOutputs,
      }),
    );

    // When the outputs are read
    const domainRef = stack.outputs.get("DomainRef")?.value;
    const regionalDomainName = stack.outputs.get("RegionalDomainName")?.value;
    const hostedZoneId = stack.outputs.get("RegionalHostedZoneId")?.value;
    const mappingRef = stack.outputs.get("MappingRef")?.value;

    // Then Ref is the domain name, the regional name is the endpoint API
    // Gateway issued the domain, and the mapping's Ref is the id it was
    // allocated
    assertIdentical(domainRef, domainName);
    assertTypeString(regionalDomainName);
    expect(regionalDomainName).toMatch(
      /^d-[a-z0-9]{10}\.execute-api\.eu-west-2\.amazonaws\.com$/u,
    );
    assertIdentical(hostedZoneId, simHttpApiRegionalHostedZoneId);
    assertTypeString(mappingRef);
    expect(mappingRef).toMatch(/^[a-z0-9]{6}$/u);
  });

  it("stops the domain resolving when the stack is torn down", async () => {
    // Given a deployed stack serving an API on a custom domain
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        resources: domainResources(),
      }),
    );

    // When the stack is torn down
    await stack.teardown();

    // Then nothing holds the domain and its hostname names no service
    assertUndefined(simAws.apiGatewayV2().findDomainName(domainName));
    assertUndefined(simAws.route53().resolveHttpHost(domainName));
    assertIdentical(stack.getResource("Domain")?.status, "DELETE_COMPLETE");
    assertIdentical(stack.getResource("Mapping")?.status, "DELETE_COMPLETE");
  });

  it("records the domain name properties it does not simulate", async () => {
    // Given a domain declaring properties this simulation does not model
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        resources: domainResources(undefined, {
          RoutingMode: "API_MAPPING_ONLY",
          Tags: { team: "orders" },
          DomainNameConfigurations: [
            {
              CertificateArn: certificateArn,
              EndpointType: "REGIONAL",
              OwnershipVerificationCertificateArn: certificateArn,
            },
          ],
        }),
      }),
    );

    // Then the domain is created without them rather than failing the stack,
    // and the record says which properties were left out
    const reasons = ignoredReasons(stack).filter((reason) =>
      reason.startsWith("Domain "),
    );
    expect(reasons.join("\n")).toMatch(/RoutingMode is not simulated/u);
    expect(reasons.join("\n")).toMatch(/Tags is not simulated/u);
    expect(reasons.join("\n")).toMatch(
      /DomainNameConfigurations\[0\]\.OwnershipVerificationCertificateArn is not simulated/u,
    );
    assertIdentical(
      simAws.apiGatewayV2().findDomainName(domainName)?.domainName,
      domainName,
    );
  });

  it("serves through a Distribution whose Origin is the regional domain name", async () => {
    // Given a template whose CloudFront Origin takes its domain from the
    // custom domain, which is the shape a stack fronting an HTTP API uses
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        handlerSource: pathReportingHandler,
        routeKeys: ["GET /orders"],
        resources: {
          ...domainResources(),
          Distribution: {
            Type: "AWS::CloudFront::Distribution",
            DependsOn: ["Mapping"],
            Properties: {
              DistributionConfig: {
                Enabled: true,
                Origins: [
                  {
                    Id: "ApiOrigin",
                    DomainName: {
                      "Fn::GetAtt": ["Domain", "RegionalDomainName"],
                    },
                    CustomOriginConfig: {
                      OriginProtocolPolicy: "https-only",
                    },
                  },
                ],
                DefaultCacheBehavior: {
                  TargetOriginId: "ApiOrigin",
                  ViewerProtocolPolicy: "redirect-to-https",
                },
              },
            },
          },
        },
        outputs: {
          DistributionDomainName: {
            Value: { "Fn::GetAtt": ["Distribution", "DomainName"] },
          },
        },
      }),
    );

    // When the Distribution is requested
    const distributionDomainName = stack.outputs.get(
      "DistributionDomainName",
    )?.value;
    assertTypeString(distributionDomainName);
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(distributionDomainName.toLowerCase(), "/orders"),
    );

    // Then the Origin resolved to the domain and the API behind it answered
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "/orders");
  });

  it("says so when asked for an attribute neither Resource type publishes", async () => {
    // Given a deployed domain and mapping
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({ resources: domainResources() }),
    );
    const domain = stack.getResource("Domain");
    const mapping = stack.getResource("Mapping");
    assertNonNullable(domain);
    assertNonNullable(mapping);

    // When an attribute neither publishes is asked for
    // Then each says so rather than answering with nothing
    assertStringIncludes(
      assertThrowsError(() => domain.attributeValue("DomainName")).message,
      "Unsupported AWS::ApiGatewayV2::DomainName attribute DomainName",
    );
    assertStringIncludes(
      assertThrowsError(() => mapping.attributeValue("Stage")).message,
      "Unsupported AWS::ApiGatewayV2::ApiMapping attribute Stage",
    );
  });
});

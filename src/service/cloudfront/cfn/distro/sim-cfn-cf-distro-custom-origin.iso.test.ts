import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { simHttpApiLambdaProxyFactory } from "../../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

describe("CloudFormation CloudFront Distribution custom Origin", () => {
  it("serves a simulated HTTP API declared as a template Origin", async () => {
    // Given an HTTP API serving a route.
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): unknown => ({ things: ["kettle"] }),
        routeKeys: ["GET /things"],
      },
      simAws,
    );

    // When a template declares a Distribution fronting that API.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "api-distribution-stack",
      template: {
        Resources: {
          ApiDistribution: {
            Type: "AWS::CloudFront::Distribution",
            Properties: {
              DistributionConfig: {
                Enabled: true,
                Origins: [
                  {
                    Id: "ApiOrigin",
                    DomainName: new URL(api.apiEndpoint).hostname,
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
      },
    });

    // Then the deployed Distribution serves the API's responses.
    const resource = stack.getResource("ApiDistribution");
    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);

    const distributionId = resource.simResource.distributionId.toLowerCase();
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({
        input: `https://${distributionId}.cloudfront.net/things`,
      }).toString(),
    );

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), '{"things":["kettle"]}');
  });
});

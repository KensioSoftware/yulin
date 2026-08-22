import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { simHttpApiLambdaProxyFactory } from "../../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

describe("CloudFormation CloudFront Distribution Origin custom headers", () => {
  it("sends a template's OriginCustomHeaders on to the Origin", async () => {
    // Given an HTTP API that admits a request carrying a secret header, which
    // is how AWS documents restricting a custom origin to CloudFront.
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        routeKeys: ["GET /things"],
        handler: (event: SimPayload2Event): unknown =>
          event.headers["x-origin-secret"] === "shibboleth"
            ? { things: ["kettle"] }
            : { message: "Forbidden" },
      },
      simAws,
    );

    // When a template declares a Distribution fronting that API and writes the
    // secret as an Origin custom header.
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
                    CustomOriginConfig: { OriginProtocolPolicy: "https-only" },
                    OriginCustomHeaders: [
                      {
                        HeaderName: "x-origin-secret",
                        HeaderValue: "shibboleth",
                      },
                    ],
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

    // Then the Distribution's requests carry it and the API admits them, while
    // a request sent to the API endpoint direct is refused.
    const resource = stack.getResource("ApiDistribution");
    assertInstanceOf(resource?.simResource, SimCloudFrontDistribution);

    const simAwsHttp = new SimAwsHttp({ simAws });
    const distributionId = resource.simResource.distributionId.toLowerCase();
    const throughDistribution = await simAwsHttp.fetch(
      new SimAwsLocalUrl({
        input: `https://${distributionId}.cloudfront.net/things`,
      }).toString(),
    );
    const direct = await simAwsHttp.fetch(
      new SimAwsLocalUrl({ input: `${api.apiEndpoint}/things` }).toString(),
    );

    assertIdentical(await throughDistribution.text(), '{"things":["kettle"]}');
    assertIdentical(await direct.text(), '{"message":"Forbidden"}');
  });
});

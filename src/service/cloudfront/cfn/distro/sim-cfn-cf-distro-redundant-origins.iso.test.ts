import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { simHttpApiLambdaProxyFactory } from "../../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

describe("CloudFormation CloudFront Distribution redundant Origins", () => {
  it("says a template declared one Origin twice, and serves both", async () => {
    // Given somewhere to catch what the deploy warns about, and an HTTP API
    // that answers whichever path a request arrives on.
    const warnings: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
      warnings.push(parts.map(String).join(" "));
    });

    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (event: SimPayload2Event): unknown => ({
          path: event.rawPath,
        }),
        routeKeys: ["GET /live/things", "GET /preview/things"],
      },
      simAws,
    );

    // When a template declares two Origins over that API's domain, identical
    // but for their Ids, with a Behavior pointing at each.
    const apiOrigin = (originId: string): SimCfnTemplateValueRecord => ({
      Id: originId,
      DomainName: new URL(api.apiEndpoint).hostname,
      CustomOriginConfig: { OriginProtocolPolicy: "https-only" },
      OriginCustomHeaders: [
        { HeaderName: "x-origin-secret", HeaderValue: "shibboleth" },
      ],
    });
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "api-distribution-stack",
      template: {
        Resources: {
          ApiDistribution: {
            Type: "AWS::CloudFront::Distribution",
            Properties: {
              DistributionConfig: {
                Enabled: true,
                Origins: [apiOrigin("ApiOrigin"), apiOrigin("PreviewOrigin")],
                DefaultCacheBehavior: {
                  TargetOriginId: "ApiOrigin",
                  ViewerProtocolPolicy: "redirect-to-https",
                },
                CacheBehaviors: [
                  {
                    PathPattern: "/preview/*",
                    TargetOriginId: "PreviewOrigin",
                    ViewerProtocolPolicy: "redirect-to-https",
                  },
                ],
              },
            },
          },
        },
      },
    });

    // Then the deploy said so, and the Distribution it deployed carries the
    // record of it alongside the two Behaviors it serves alike.
    const resource = stack.getResource("ApiDistribution");
    assertInstanceOf(resource?.simResource, SimCloudFrontDistribution);

    assertArrayLength(warnings, 1);
    assertStringIncludes(String(warnings.at(0)), "PreviewOrigin");
    assertArrayLength(resource.simResource.redundantOrigins, 1);
    assertNonNullable(resource.simResource.redundantOrigins.at(0));
    assertIdentical(
      resource.simResource.redundantOrigins[0].repeatsOriginId,
      "ApiOrigin",
    );

    const simAwsHttp = new SimAwsHttp({ simAws });
    const distributionId = resource.simResource.distributionId.toLowerCase();
    const live = await simAwsHttp.fetch(
      new SimAwsLocalUrl({
        input: `https://${distributionId}.cloudfront.net/live/things`,
      }).toString(),
    );
    const preview = await simAwsHttp.fetch(
      new SimAwsLocalUrl({
        input: `https://${distributionId}.cloudfront.net/preview/things`,
      }).toString(),
    );

    assertIdentical(await live.text(), '{"path":"/live/things"}');
    assertIdentical(await preview.text(), '{"path":"/preview/things"}');
  });
});

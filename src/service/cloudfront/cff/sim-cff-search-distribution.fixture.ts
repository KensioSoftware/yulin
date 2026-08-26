import { assertNonNullable } from "@kensio/smartass";

import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { simHttpApiLambdaProxyFactory } from "../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { simCfDistroConfigFactory } from "../distribution/sim-cf-distro-config.factory.js";
import { makeCffFunctionCodeInput } from "./function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

/**
 * Put a viewer-request Function in front of an Origin echoing the query it is
 * sent, and return the URL a viewer reaches the Distribution on.
 */
export async function searchDistributionUrl(
  simAws: SimAws,
  path: string,
  handler: CloudFrontFunction.ViewerRequestHandler,
): Promise<string> {
  const api = await simHttpApiLambdaProxyFactory.make(
    {
      handler: (event: SimPayload2Event): unknown => event.rawQueryString,
      routeKeys: ["GET /liju/search"],
    },
    simAws,
  );

  const cff = await simAws.cloudFront().createFunction({
    input: {
      Name: "search-redirect",
      FunctionConfig: { Comment: "Search", Runtime: "cloudfront-js-2.0" },
      FunctionCode: makeCffFunctionCodeInput(handler),
    },
  });

  const originHostname = new URL(api.apiEndpoint).hostname;
  const creation = await simAws.cloudFront().createDistribution({
    input: {
      DistributionConfig: simCfDistroConfigFactory.make({
        CallerReference: "search-query-string",
        Origins: {
          Items: [
            {
              Id: "SiteOrigin",
              DomainName: originHostname,
              CustomOriginConfig: { OriginProtocolPolicy: "https-only" },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "SiteOrigin",
          ViewerProtocolPolicy: "allow-all",
          FunctionAssociations: {
            Items: [
              {
                EventType: "viewer-request",
                FunctionARN: cff.FunctionMetadata.FunctionARN,
              },
            ],
          },
        },
      }),
    },
  });

  const hostname = creation.Distribution?.DomainName;
  assertNonNullable(hostname);

  return new SimAwsLocalUrl({ input: `https://${hostname}${path}` }).toString();
}

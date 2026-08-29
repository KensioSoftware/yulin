/**
 * What a custom Origin reads of the viewer's request, with and without an
 * origin request policy.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

// A function reporting the query string and the user agent it was asked with.
const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "search",
    Role: "arn:aws:iam::111111111111:role/SearchRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: {
          rawQueryString: string;
          headers: Record<string, string>;
        }) => ({
          query: event.rawQueryString,
          userAgent: event.headers["user-agent"],
        }),
      ),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "search", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /search",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /open/search",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "search",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

// Two Behaviors on the same Origin. The default names no policy, and /open/*
// names AllViewer, one of CloudFront's managed policies.
const distributionCreation = await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "search-site",
      Comment: "Search CDN",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "api-origin",
            DomainName: new URL(ApiEndpoint).hostname,
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: "https-only",
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "api-origin",
        ViewerProtocolPolicy: "allow-all",
      },
      CacheBehaviors: {
        Quantity: 1,
        Items: [
          {
            PathPattern: "/open/*",
            TargetOriginId: "api-origin",
            ViewerProtocolPolicy: "allow-all",
            OriginRequestPolicyId: "216adef6-5c7f-47e4-b989-5492eafa07d3",
          },
        ],
      },
    },
  }),
);

const distroHostname = distributionCreation.Distribution!.DomainName!;
const srv = await serveSimAws({ simAws });

try {
  const withheld = await fetch(
    srv.localUrl(`http://${distroHostname}/search?q=kettle`),
    { headers: { "user-agent": "Firefox" } },
  );

  // {"query":"","userAgent":"Amazon CloudFront"}
  console.log(await withheld.text());

  const forwarded = await fetch(
    srv.localUrl(`http://${distroHostname}/open/search?q=kettle`),
    { headers: { "user-agent": "Firefox" } },
  );

  // {"query":"q=kettle","userAgent":"Firefox"}
  console.log(await forwarded.text());
} finally {
  await srv.close();
}

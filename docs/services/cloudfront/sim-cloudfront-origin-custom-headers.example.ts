/**
 * An HTTP API answering only the requests that came through the Distribution.
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
const originSecret = "5d6e2b0c6f564c1e9d5b2f1a5b8c9d70";

// A function serving the API, which reads the secret off every request.
const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "profile",
    Role: "arn:aws:iam::111111111111:role/ProfileRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: { headers: Record<string, string> }) =>
          event.headers["x-origin-secret"] === originSecret
            ? { name: "Ada" }
            : { message: "Forbidden" },
      ),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "profile", ProtocolType: "HTTP" }),
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
    RouteKey: "GET /user/profile",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "profile",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

// A Distribution that sends the secret with every request to that Origin.
const distributionCreation = await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "user-site",
      Comment: "User API CDN",
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
            CustomHeaders: {
              Quantity: 1,
              Items: [
                { HeaderName: "x-origin-secret", HeaderValue: originSecret },
              ],
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "api-origin",
        ViewerProtocolPolicy: "allow-all",
      },
    },
  }),
);

const distroHostname = distributionCreation.Distribution!.DomainName!;
const srv = await serveSimAws({ simAws });

try {
  const throughCdn = await fetch(
    srv.localUrl(`http://${distroHostname}/user/profile`),
  );
  const direct = await fetch(srv.localUrl(`${ApiEndpoint}/user/profile`));

  // {"name":"Ada"}
  console.log(await throughCdn.text());
  // {"message":"Forbidden"}
  console.log(await direct.text());
} finally {
  await srv.close();
}

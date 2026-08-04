/**
 * A simulated CloudFront Distribution fronting a simulated HTTP API.
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
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

// A Bucket holding the site.
await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "site",
    Key: "index.html",
    Body: "<h1>Site</h1>",
  }),
);

// An HTTP API serving /api/things from a function.
const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "things",
    Role: "arn:aws:iam::111111111111:role/ThingsRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => ({ things: ["kettle"] })) },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "things", ProtocolType: "HTTP" }),
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
    RouteKey: "GET /api/things",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "things",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

// One Distribution serving the site, with /api/* going to the API.
const distributionCreation = await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "site-and-api",
      Comment: "Site and API CDN",
      Enabled: true,
      Origins: {
        Quantity: 2,
        Items: [
          {
            Id: "site-origin",
            DomainName: "site.s3.amazonaws.com",
            S3OriginConfig: { OriginAccessIdentity: "" },
          },
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
        TargetOriginId: "site-origin",
        ViewerProtocolPolicy: "allow-all",
      },
      CacheBehaviors: {
        Quantity: 1,
        Items: [
          {
            PathPattern: "/api/*",
            TargetOriginId: "api-origin",
            ViewerProtocolPolicy: "allow-all",
          },
        ],
      },
    },
  }),
);

const distroHostname = distributionCreation.Distribution!.DomainName!;
const srv = await serveSimAws({ simAws });

try {
  const page = await fetch(srv.localUrl(`http://${distroHostname}/index.html`));
  const things = await fetch(
    srv.localUrl(`http://${distroHostname}/api/things`),
  );

  console.log(await page.text());
  console.log(await things.text());
} finally {
  srv.close();
}

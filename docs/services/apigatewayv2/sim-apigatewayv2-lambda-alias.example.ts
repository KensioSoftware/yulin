/**
 * Serving an HTTP API route from a Lambda alias, and moving the alias.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
  UpdateAliasCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const lambda = simAws.lambda();

const { FunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `served by version ${context.functionVersion}`,
      })),
    },
  }),
);

await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "orders" }),
);
await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "orders" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "orders",
    Name: "live",
    FunctionVersion: "1",
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: `${FunctionArn}:live`,
    PayloadFormatVersion: "2.0",
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "$default",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

// The grant names the alias. One made on the function alone leaves this call
// refused with a 500.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "orders",
    Qualifier: "live",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

const srv = await serveSimAws({ simAws });

const first = await fetch(srv.localUrl(ApiEndpoint));
console.log(await first.text());

await lambda.updateAlias(
  new UpdateAliasCommand({
    FunctionName: "orders",
    Name: "live",
    FunctionVersion: "2",
  }),
);

const second = await fetch(srv.localUrl(ApiEndpoint));
console.log(await second.text());

await srv.close();

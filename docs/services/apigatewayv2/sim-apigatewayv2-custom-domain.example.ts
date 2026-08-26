/**
 * Serving a simulated HTTP API on a custom domain name and API mapping.
 */

import {
  CreateApiCommand,
  CreateApiMappingCommand,
  CreateDomainNameCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "pets",
    Role: "arn:aws:iam::111111111111:role/PetsRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawPath: event.rawPath,
          routeKey: event.routeKey,
          stage: event.requestContext.stage,
          domainName: event.requestContext.domainName,
        }),
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "pets", ProtocolType: "HTTP" }),
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
    RouteKey: "GET /pets/{petId}",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "dev", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "pets",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

await apiGateway.createDomainName(
  new CreateDomainNameCommand({ DomainName: "api.example.test" }),
);

await apiGateway.createApiMapping(
  new CreateApiMappingCommand({
    DomainName: "api.example.test",
    ApiId,
    Stage: "dev",
    ApiMappingKey: "orders",
  }),
);

const srv = await serveSimAws({ simAws });

const response = await fetch(
  srv.localUrl("https://api.example.test/orders/pets/6"),
);

console.log(await response.json());

await srv.close();
